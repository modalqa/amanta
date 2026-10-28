import { AppError } from "../errors";

/** Extracts the first JSON object from a model response (tolerates ```json fences). */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AppError("AI_FAILED", "ai_no_json");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new AppError("AI_FAILED", "ai_invalid_json");
  }
}
