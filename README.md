# Amanta: food safety and quality operations

Amanta is a multi-tenant SaaS for Indonesian food and beverage manufacturers. It turns SOPs and HACCP documents into reviewed controls, shift checklists and CCP monitoring. It also tracks deviations through to CAPA and covers suppliers, halal certificates, batch/lot traceability and audit reports.

The interface is in Indonesian (*Bahasa Indonesia*) first, with English available.

> **Status:** working MVP, verified by automated tests (see [Test results](#test-results)). It is **not production-certified**. Read [Limitations](#limitations) and [docs/SECURITY.md](docs/SECURITY.md) before you deploy it. The brand name "Amanta" is a placeholder: check trademark availability before you use it.

## Features

| Area | What it does |
|---|---|
| **Organizations & access** | Self-service sign-up creates the organization and makes you its Owner. You can invite members with one-time links. There are six roles (Owner, Admin, QA Manager, Supervisor, Operator, Auditor), and permissions are checked on the server for every action. A user can belong to several organizations and switch between them. Accounts lock out after repeated failed logins, and login is rate-limited. |
| **Tenant isolation** | Every tenant query goes through a Prisma client scoped to that tenant. IDs supplied by users are checked for ownership before records are linked. Integration and E2E tests prove that one tenant cannot read or change another tenant's data. |
| **Documents** | Upload SOPs, HACCP plans, recipes, specs, COAs, certificates and records (PDF, DOCX, XLSX, TXT, CSV, PNG, JPG). Files are validated by their magic bytes. Each file gets a SHA-256 hash and is checked against it on download. Files are stored in S3-compatible or local storage and served only through an authorized route. Text is extracted in a background job. |
| **AI assistance** | AI drafts hazard analyses, HACCP controls, CCPs, critical limits and operator checklists from your documents, and drafts CAPAs (root cause plus actions) from deviations. Supported providers are Anthropic, or any OpenAI-compatible API including OpenAI, OpenRouter, Ollama and vLLM. AI output is schema-validated, treated as untrusted, and saved only as a **draft**. |
| **Human review gate** | Every AI-drafted control and checklist must be approved by someone with the QA permission. A CCP cannot be approved without a critical limit. Approved controls are locked: to change one, you create a new draft version and approve it again. |
| **Checklists & CCP monitoring** | Checklists can be built by hand, generated from approved CCPs, or drafted by AI. The checklist screen is designed for tablets on the production floor. Values outside their limits fail the check. CCP readings come from checklists, manual entry, or sensors through the API. A reading outside its critical limit **automatically opens a HIGH deviation** and puts the batch on hold. |
| **Deviations & CAPA** | Deviations get codes (DEV-2026-0001) and go through investigation, root cause and product disposition. CAPAs have an owner, a due date, a completion record and an effectiveness check. The person who checks a CAPA must be different from its owner. A deviation cannot be closed until the closure rules are met. |
| **Suppliers & traceability** | Suppliers and certificates (Halal BPJPH, BPOM, SPP-IRT, SNI, ISO 22000, FSSC 22000, COA, NIB and others) with expiry alerts. A supplier can only be approved with a valid certificate. Ingredient lots start in quarantine and are released by QA. Halal-critical ingredients need a valid halal certificate before release. Batches can only use released lots. You can trace backward and forward, including a mock recall. |
| **Dashboards & reports** | The dashboard shows live KPIs: open and critical deviations, overdue CAPAs, 7-day CCP compliance, certificate expiry and batches on hold. Downloadable reports cover the HACCP plan (PDF), CCP log (PDF/CSV), deviations and CAPA (PDF/XLSX), batch traceability (PDF), supplier certificates (XLSX/CSV), the audit trail (CSV) and a combined **audit package** (PDF). |
| **Audit trail** | The log is append-only and hash-chained: a database trigger blocks UPDATE and DELETE, and you can check the chain from the UI. Every change, download and report is logged. |
| **Localization** | Interface in Indonesian and English. Each organization sets its time zone (WIB/WITA/WIT), date format, temperature unit (°C/°F, stored as °C) and weight unit. |
| **Integration API** | REST API at `/api/v1/*` using scoped, hashed and expiring API keys with per-key rate limits. The OpenAPI spec is at `/api/v1/openapi.json`. Example uses: posting sensor CCP readings, and reading batches and deviations from an ERP. |
| **Jobs & alerts** | Background jobs run on pg-boss (on PostgreSQL, so no Redis is needed): extraction, AI, and a daily scan for expiring certificates, overdue CAPAs and expiring lots. Alerts are de-duplicated. |

The architecture and design decisions are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (local development)

You need Node.js 24.22.1 or newer (or 22.23.4 or newer) and PostgreSQL 15 or newer.

```bash
cp .env.example .env
# Set APP_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Set DATABASE_URL to your PostgreSQL database.

npm ci
npx prisma generate
npx prisma migrate deploy        # or: npm run db:migrate:fallback (see note below)
npm run db:seed                  # optional demo data (two tenants)
npm run dev                      # web on http://localhost:3000
npm run worker                   # in a second terminal: extraction, AI and alert jobs
```

Demo logins come from the seed. They use the password `Amanta-Demo-2026` unless you set `SEED_PASSWORD`. **They are for local development only.**

`owner@contoh-pangan.test`, `qa@contoh-pangan.test`, `qa2@…`, `supervisor@…`, `operator@…`, `auditor@…`, plus a second tenant at `owner@sambal-lain.test`.

### AI provider

AI is optional. Every feature works manually without it, and the UI shows a clear "not configured" state.

```bash
# Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-5            # use a model available on your account

# Or any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Azure gateway, Ollama, vLLM)
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1    # e.g. http://localhost:11434/v1 for Ollama
OPENAI_MODEL=gpt-4.1-mini
```

**Bring your own key (BYOK).** An organization's Owner or Admin can choose their own provider, model, base URL and API key under **Pengaturan → AI** (Settings → AI). This works even when the server has `AI_PROVIDER=none`, and it applies to that organization only. The key and settings are stored encrypted (AES-256-GCM). A stored key is never reused for a different provider or URL. Base URLs must be HTTPS and resolve to public addresses, and the check runs again before every request. Self-hosted single-company servers that use a private Ollama/vLLM can set `AI_BYOK_ALLOW_PRIVATE_URLS=true`. `AI_BYOK_ENABLED=false` turns BYOK off. The remaining risk is DNS rebinding between the check and the connection: redirects are refused, but the connection is not pinned to the checked IP. Model names change over time, so check the provider's current model list. **Document content is sent to the provider you configure.** Check that this fits your data-protection obligations (see [docs/COMPLIANCE.md](docs/COMPLIANCE.md)).

## Docker (full stack)

```bash
cp .env.docker.example .env.docker   # fill in the secrets
docker compose --env-file .env.docker up -d --build postgres s3
docker compose --env-file .env.docker --profile tools run --rm migrate
docker compose --env-file .env.docker up -d --build web worker
```

The stack runs PostgreSQL 17, SeaweedFS as the S3-compatible store (Apache-2.0), the Next.js standalone web server, and the worker. MinIO is not used because its community edition is no longer distributed upstream as binaries or images. Production guidance is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tests

```bash
npm run lint && npm run typecheck
npm run test:unit                       # pure logic, i18n parity
npm run test:integration                # real PostgreSQL (TEST_DATABASE_URL, must contain "test")
npm run build && npm run test:e2e       # Playwright: real web server + worker + local AI stub
```

The E2E suite starts a local **OpenAI-compatible stub** (`tests/helpers/ai-stub.ts`). This exercises the real HTTP provider code path with no API key. The stub exists only in tests and is never used by the application.

### Test results

The latest run in the build environment (2026-10-28) is summarized in [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md):

* Unit: **19/19** passed.
* Integration (PostgreSQL 16): **22/22** passed.
* E2E (Chromium): **11/11** passed.
* Lint and typecheck are clean, and `npm audit` reports 0 vulnerabilities.

## Limitations

* **Not a certification or compliance product.** Templates and AI drafts must be validated by competent food-safety personnel against current BPOM, BPJPH, SNI and Codex requirements.
* **No OCR.** Scanned PDFs and images are stored as evidence, but no text is extracted from them.
* **No PostgreSQL row-level security yet.** Tenant isolation is enforced in the application layer and covered by tests. RLS is recommended as defense in depth.
* **The initial migration SQL was generated from the schema** using the Prisma schema WASM and `scripts/generate-migration-sql.mjs`, because Prisma's native schema engine could not be downloaded in the build sandbox. CI runs `prisma migrate diff --exit-code` to detect drift. That check has not yet been run against the real engine.
* **Docker images were not built in the build sandbox** because Docker Hub was blocked there. The compose file has been validated. The S3 driver was tested against an S3 emulator (s3rver), not against SeaweedFS or AWS.
* **Translation gaps.** Report PDF labels are in Indonesian, with status values translated. Org-wide notifications use a single shared read state.
* **No SSO, MFA, email delivery or offline mode yet.** Invitations are shared as links.

More detail is in [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md#known-gaps).

## Project layout

```
prisma/              schema, migrations, seed
src/app/             Next.js routes (UI, server actions, /api/v1)
src/server/          auth, tenant scoping, services, AI, storage, jobs, reports
src/worker/          pg-boss worker entry point
src/i18n/            id/en dictionaries
tests/               unit, integration, e2e, fixtures, AI stub
docs/                architecture, deployment, security, compliance, research, licenses
```

## License

The code is proprietary to its owner and the package is marked `UNLICENSED`. Third-party licenses are reviewed in [docs/LICENSES.md](docs/LICENSES.md).
