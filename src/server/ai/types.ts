import type { z } from "zod";

export type AiRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
};

export type AiResult<T> = { data: T; model: string; provider: string; inputTokens?: number; outputTokens?: number };

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateJson<T>(req: AiRequest<T>): Promise<AiResult<T>>;
}
