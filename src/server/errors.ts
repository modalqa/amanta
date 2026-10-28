export type ErrorCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED"
  | "TENANT_REQUIRED" | "TENANT_VIOLATION" | "INVALID_STATE" | "FILE_REJECTED" | "AI_NOT_CONFIGURED"
  | "AI_FAILED" | "STORAGE_FAILED" | "ACCOUNT_LOCKED";

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = "AppError";
  }
}

export function httpStatus(code: ErrorCode): number {
  switch (code) {
    case "UNAUTHENTICATED": return 401;
    case "FORBIDDEN": case "TENANT_VIOLATION": case "ACCOUNT_LOCKED": return 403;
    case "NOT_FOUND": return 404;
    case "VALIDATION": case "FILE_REJECTED": return 400;
    case "CONFLICT": case "INVALID_STATE": return 409;
    case "RATE_LIMITED": return 429;
    case "AI_NOT_CONFIGURED": return 503;
    default: return 500;
  }
}
