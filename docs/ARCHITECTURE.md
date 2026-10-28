# Amanta: architecture and decisions

Amanta is a multi-tenant SaaS for food safety and quality operations, aimed at Indonesian food and beverage manufacturers. Its scope came from the problems a vendor in this space (IONI) describes publicly. No code, branding or assets were taken from that vendor. See [docs/RESEARCH.md](RESEARCH.md).

## System overview

```
Browser (Next.js App Router, React Server Components, Server Actions)
   │  session cookie (httpOnly, SameSite=Lax)
   ▼
Next.js server ──► src/server/*  (auth, authz, tenant-scoped data access, services)
   │                 │
   │                 ├─► PostgreSQL (Prisma 7 + @prisma/adapter-pg)
   │                 ├─► Object storage (S3-compatible, or local disk in dev)
   │                 └─► pg-boss queue (stored in the same PostgreSQL database)
   ▼
Worker process (src/worker) ──► document text extraction, AI generation, daily alerts
   └─► AI provider layer (Anthropic Messages API, or any OpenAI-compatible Chat Completions API)

Integrations ──► /api/v1/* (Bearer API keys, hashed, scoped, rate-limited)
```

## Key decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Next.js 16 App Router + TypeScript 6, Server Actions for UI mutations** | One deployable unit for UI and backend, with typed end to end. Server Actions get Next's built-in Origin check. |
| 2 | **PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`)** | Required stack. Prisma 7's Rust-free client keeps the runtime image small. |
| 3 | **Tenant isolation through a tenant-scoped Prisma client** (`src/server/db/tenant.ts`) | Every query on a tenant model has `organizationId` injected into `where` and `data`. Cross-entity references are checked with `assertOwned`. Integration tests prove that tenant A cannot read or change tenant B's data. A future hardening step is PostgreSQL row-level security (RLS). |
| 4 | **Own session auth** (argon2id password hashes, random 256-bit session tokens stored as SHA-256 hashes) | No third-party identity dependency is needed for an on-prem or self-host option. Sessions can be revoked server side. Includes account lockout and rate limiting. |
| 5 | **RBAC with a static permission matrix** (`src/server/auth/permissions.ts`) | Six roles: OWNER, ADMIN, QA_MANAGER, SUPERVISOR, OPERATOR, AUDITOR. Every server action and API route checks a named permission on the server. |
| 6 | **pg-boss for background jobs** | It uses the existing PostgreSQL, so no Redis is required. Jobs are durable and retried, which fits the low-ops deployments targeted. |
| 7 | **Storage driver interface: S3 (`@aws-sdk/client-s3`, MinIO/AWS/R2/Wasabi) or local disk** | S3-compatible storage for production, local disk for tests. Downloads always pass through an authorized route handler and are never public URLs. |
| 8 | **AI provider abstraction** (`src/server/ai`) with `anthropic` and `openai-compatible` providers, set through environment variables, plus an encrypted per-organization key override | Avoids vendor lock-in. The OpenAI-compatible provider covers OpenAI, Azure-style gateways, Groq, OpenRouter and local Ollama or vLLM, which matters for data residency. |
| 9 | **AI output is untrusted.** It is validated with zod schemas and stored as `DRAFT`. A human with `haccp:approve` permission must approve it before it becomes active. | This is food safety. The AI can only propose controls and never activate them. |
| 10 | **Append-only, hash-chained audit log** (application hash chain plus a database trigger that blocks UPDATE and DELETE) | Gives tamper evidence for audits. Chain integrity can be checked from the Audit page. |
| 11 | **Secrets encrypted with AES-256-GCM** using `APP_ENCRYPTION_KEY` | Per-organization AI keys are never stored in plaintext. |
| 12 | **Postgres-backed fixed-window rate limiter** | Works across several app instances without extra infrastructure. |
| 13 | **Indonesian-first interface** (`id`, with `en` as fallback). The organization sets timezone (WIB/WITA/WIT), date format, temperature unit and weight unit. | Temperatures are stored in °C and converted for display. |

## Module map

| Area | Server code | UI routes |
|------|-------------|-----------|
| Auth and organizations | `src/server/auth/*` | `/login`, `/register`, `/select-org`, `/app/settings/*` |
| Documents | `src/server/services/documents.ts`, `src/server/storage/*`, `src/server/extract/*` | `/app/documents` |
| AI | `src/server/ai/*`, `src/worker/jobs/*` | `/app/documents/[id]`, `/app/deviations/[id]` |
| HACCP review | `src/server/services/haccp.ts` | `/app/haccp` |
| Checklists and CCP | `src/server/services/checklists.ts`, `ccp.ts` | `/app/checklists`, `/app/ccp` |
| Deviations and CAPA | `src/server/services/deviations.ts`, `capa.ts` | `/app/deviations`, `/app/capa` |
| Suppliers and traceability | `src/server/services/suppliers.ts`, `traceability.ts` | `/app/suppliers`, `/app/ingredients`, `/app/lots`, `/app/batches` |
| Dashboard and reports | `src/server/services/dashboard.ts`, `reports/*` | `/app`, `/app/reports` |
| Audit | `src/server/audit.ts` | `/app/audit` |
| Public API | `src/app/api/v1/*` | `/api/v1/openapi.json` |

## Security controls

- **Authentication:** argon2id password hashing, lockout after 5 failed attempts, rate limits on login and registration, session rotation at login, and httpOnly, Secure, SameSite=Lax cookies.
- **Authorization:** permission checks on the server. The UI only hides buttons the user cannot use.
- **Tenant isolation:** the scoped client, ownership checks on referenced IDs, and integration tests.
- **File uploads:** a size limit, an allow-list checked against the file's magic bytes, rejection of extension and content mismatches, a SHA-256 hash, randomized storage keys, and `Content-Disposition: attachment` on download.
- **AI:** prompts mark document text as untrusted data, outputs are schema-validated and limited in size, and nothing activates without human approval.
- **Headers:** CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`.
- **API:** Bearer keys in the format `amk_<prefix>_<secret>`. Only a SHA-256 hash is stored. Keys have scopes, an expiry, revocation and per-key rate limits.
- **Audit:** the hash-chained log covers every mutation.
- **CI:** typecheck, lint, tests, `npm audit`, gitleaks, Trivy filesystem scan and CodeQL.
