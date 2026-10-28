# Security

## Secrets

| Secret | Where | Notes |
|---|---|---|
| `APP_ENCRYPTION_KEY` | Environment only | AES-256-GCM key for per-organization secrets. If you rotate it, re-encrypt the `OrgSecret` rows: the `keyVersion` column is reserved for this, but no rotation tool exists yet. |
| `DATABASE_URL`, `S3_*` | Environment only | Use a least-privilege database role. Keep object storage private, with no public bucket policy. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Environment, or encrypted per organization | Never logged. The audit trail stores only an 8-character SHA-256 fingerprint. |
| API keys (`amk_…`) | Stored as SHA-256 hash | Shown once at creation. They have scopes, expire, can be revoked, and are rate-limited per key and per IP. |
| Session tokens | Stored as SHA-256 hash | 256-bit random value in an httpOnly, SameSite=Lax cookie (`Secure` when `COOKIE_SECURE=true`). The session rotates when you switch organization. |

`.env`, `.env.*` (except the examples), keys and storage directories are git-ignored. **No secrets are hard-coded in the code.** The demo seed password is a documented local-only default, the seed refuses to run in production, and the E2E and test keys are dummy values. CI runs gitleaks on the full git history.

## Application controls

* **Authorization.** `ensure(ctx, permission)` runs inside every service function, not only in the UI. Pages without the right permission redirect with `error=forbidden`.
* **Tenant isolation.** `tenantDb(orgId)` adds `organizationId` to every read and write on tenant models, including inside transactions. It rejects cross-tenant `organizationId` values outright. `assertOwned()` checks that user-supplied foreign keys belong to the tenant. Cross-tenant access is tested at the service, raw-client and browser levels.
* **Uploads.**
  - Size limit.
  - File type detected from magic bytes against an allow-list. Extension mismatches are rejected.
  - Text files must be UTF-8 and contain no NUL bytes.
  - Storage keys are random, so user-supplied file names never become paths.
  - SHA-256 is checked on every download.
  - Downloads are served as `attachment` with `nosniff` and a `sandbox` CSP.
* **AI.**
  - Document text is wrapped and marked as untrusted data in the prompt.
  - Output is parsed as JSON and validated with zod, with length limits.
  - Results are stored only as drafts, and approval is required.
  - Provider errors are logged without request headers.
* **Web.**
  - A nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'` and `form-action 'self'`. HSTS is sent when `COOKIE_SECURE=true`.
  - Server Actions use Next.js's built-in Origin check.
  - CSV and XLSX exports are protected against formula injection.
* **Rate limits.** These are stored in PostgreSQL:
  - Login: 30 per 15 minutes per IP and 10 per email. Accounts lock for 15 minutes after 5 failures.
  - Registration, invitations, uploads, AI runs, reports and the API.
* **Audit.** A hash chain (SHA-256 over a canonical JSON of each entry plus the previous hash), protected by a database trigger that blocks UPDATE and DELETE. It can be verified from the UI and in the audit package.

## Supply chain

* Run `npm audit --audit-level=high`, OSV-Scanner, the license allow-list (`npm run licenses:check`), CodeQL (security-extended) and Dependabot (npm, actions, docker). These are set up in `.github/`.
* **Pin GitHub Actions to commit SHAs** before production use. The workflows currently use major tags because GitHub was not reachable from the build environment. Trivy's GitHub Actions were compromised in March 2026 (multiple vendor reports), so the pipeline does not use them.
* The `uuid` dependency of exceljs is overridden to `^11.1.1` to fix GHSA-w5hq-g745-h8pq. The override was verified with a workbook write/read test.
* Pin base images by digest in production.

## Recommended hardening before production

1. PostgreSQL row-level security as a second layer of tenant isolation.
2. MFA (TOTP or WebAuthn) for Owner, Admin and QA roles, and SSO (OIDC) for larger customers.
3. Malware scanning of uploads (ClamAV or a cloud scanner) before extraction.
4. An encryption key rotation tool, and object storage encryption with a KMS.
5. Centralized log shipping with alerting on failed logins and on `TENANT_VIOLATION` errors.
6. An external penetration test.
