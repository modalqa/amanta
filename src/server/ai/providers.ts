import "server-only";
import { AppError } from "../errors";
import { parseJsonObject } from "./json";
import type { AiProvider, AiRequest, AiResult } from "./types";

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal, redirect: "error" });
    const text = await res.text();
    if (!res.ok) {
      // Never echo request headers (API keys); include a short slice of the provider error only.
      throw new AppError("AI_FAILED", `ai_http_${res.status}`, { body: text.slice(0, 500) });
    }
    return JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof AppError) throw e;
    if ((e as Error).name === "AbortError") throw new AppError("AI_FAILED", "ai_timeout");
    throw new AppError("AI_FAILED", "ai_network_error", { message: (e as Error).message });
  } finally {
    clearTimeout(timer);
  }
}

function validate<T>(req: AiRequest<T>, raw: string) {
  const parsed = req.schema.safeParse(parseJsonObject(raw));
  if (!parsed.success) {
    throw new AppError("AI_FAILED", "ai_schema_mismatch", { issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`) });
  }
  return parsed.data;
}

/** Anthropic Messages API. */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  constructor(private apiKey: string, readonly model: string, private timeoutMs: number, private baseUrl = "https://api.anthropic.com") {}
  async generateJson<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    const res = await postJson(`${this.baseUrl}/v1/messages`, { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }, {
      model: this.model,
      max_tokens: req.maxTokens ?? 8000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    }, this.timeoutMs);
    const content = (res.content as Array<{ type: string; text?: string }> | undefined) ?? [];
    const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const usage = res.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    return { data: validate(req, text), model: String(res.model ?? this.model), provider: this.name, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
  }
}

/** Any OpenAI-compatible Chat Completions API (OpenAI, OpenRouter, Groq, Ollama, vLLM, gateways). */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai";
  constructor(private apiKey: string, readonly model: string, private baseUrl: string, private timeoutMs: number) {}
  async generateJson<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    const res = await postJson(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}, {
      model: this.model,
      max_tokens: req.maxTokens ?? 8000,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: req.system }, { role: "user", content: req.prompt }],
    }, this.timeoutMs);
    const choices = res.choices as Array<{ message?: { content?: string } }> | undefined;
    const text = choices?.[0]?.message?.content ?? "";
    const usage = res.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    return { data: validate(req, text), model: String(res.model ?? this.model), provider: this.name, inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens };
  }
}
