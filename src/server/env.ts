import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().optional(),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  STORAGE_DRIVER: z.enum(["s3", "local"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("amanta-documents"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  S3_SSE: z.string().optional(),
  UPLOAD_MAX_MB: z.coerce.number().positive().max(200).default(20),
  AI_PROVIDER: z.enum(["anthropic", "openai", "none"]).default("none"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
  ANTHROPIC_BASE_URL_OVERRIDE: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  // BYOK: organization admins may configure their own provider, model, base URL and key.
  AI_BYOK_ENABLED: z.enum(["true", "false"]).default("true"),
  // Allow BYOK base URLs on private/loopback networks and plain HTTP (self-hosted Ollama/vLLM). Keep false on multi-tenant hosting.
  AI_BYOK_ALLOW_PRIVATE_URLS: z.enum(["true", "false"]).default("false"),
  AI_TIMEOUT_MS:z.coerce.number().int().positive().default(90000),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(60000),
  ALERTS_CRON: z.string().default("0 23 * * *"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test helper: re-read process.env on next access. */
export function resetEnvCache() {
  cached = undefined;
}
