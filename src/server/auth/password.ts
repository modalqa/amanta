import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (m=19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  try {
    return await verify(hashStr, password);
  } catch {
    return false;
  }
}

/** Basic strength policy: 10+ chars, letters and digits, not trivially common. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 10) return "password_too_short";
  if (pw.length > 200) return "password_too_long";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "password_needs_letters_digits";
  const common = ["password123", "1234567890", "qwerty1234", "passw0rd12", "admin12345"];
  if (common.includes(pw.toLowerCase())) return "password_too_common";
  return null;
}
