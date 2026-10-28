# Test results

**Run:** 2026-10-28, in the build sandbox. Environment: Node 22.23.4, PostgreSQL 16, Chromium (Playwright 1.63.0).

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 problems |
| Typecheck | `npm run typecheck` | ✅ 0 errors |
| Unit + integration | `npx vitest run` | ✅ 41/41 (5 files) |
| Production build | `npm run build` | ✅ |
| E2E | `npx playwright test` | ✅ 11/11 |
| Dependency vulnerabilities | `npm audit` | ✅ 0 vulnerabilities |
| License policy | `npm run licenses:check` | ✅ |
| Hard-coded secret patterns | regex scan of the source tree | ✅ no matches (gitleaks runs in CI) |
| Standalone server + PDF/XLSX/CSV reports | `node .next/standalone/server.js` | ✅ |
| S3 storage driver | put, get, delete and path traversal, against the s3rver emulator | ✅ |
| Mobile layout (Pixel 7 viewport) | checklist runner | ✅ no horizontal overflow |

## What the tests cover

* **Tenant isolation:**
  - Service level.
  - Raw scoped client: update/delete by a foreign id, rejection of an explicit foreign `organizationId`.
  - Transactions.
  - Browser: a second tenant gets 404 on a foreign deviation URL.
* **RBAC:**
  - Auditor and operator restrictions.
  - Forbidden pages redirect.
  - Admins cannot assign the Owner role.
  - The last Owner is protected.
* **Critical journey, end to end:**
  1. Register an organization.
  2. Upload an SOP, which is extracted in the background.
  3. AI HACCP draft through the HTTP provider against the local stub.
  4. Reject one control with a note and bulk-approve the rest.
  5. A checklist linked to unapproved CCPs is blocked; activate it once the CCPs are approved.
  6. Create a batch.
  7. Submit a checklist with a failed CCP. This creates a CCP record and a HIGH deviation, and puts the batch on hold.
  8. AI CAPA draft, accepted as two CAPAs.
  9. Investigation and disposition.
  10. The assignee completes the CAPAs and cannot verify them.
  11. An invited QA user verifies them (one rework cycle in the integration test).
  12. Close the deviation.
  13. Reports: audit package, HACCP plan, deviations/CAPA XLSX, CCP CSV.
  14. Audit chain verified.
* **Security:**
  - Unauthenticated access is refused.
  - API keys: scoped, revocable, hashed.
  - Rate limiting and account lockout.
  - AES-GCM encryption tied to the organization.
  - The audit log is append-only (database trigger), and tampering is detected.
  - Upload validation by magic bytes, extension mismatch, binary text.
  - Path traversal in storage.
  - CSV formula injection.
* **Business rules:**
  - Supplier approval needs a valid certificate.
  - Halal-critical lot release needs a valid halal certificate.
  - Batches can only use released lots.
  - Open deviations block batch release.
  - Shipments cannot exceed the batch quantity.
  - CCPs need limits to be approved; approved controls are locked.
  - Readings with a future timestamp are rejected.
  - CAPA due dates and segregation of duties.
  - Deviation closure rules.
  - Daily alerts are de-duplicated.
* **AI robustness:**
  - Provider not configured gives a clear failure state.
  - Output that does not match the schema is rejected.
  - Loose type coercion, for example the string `"false"` is not treated as true.

## Known gaps

* **Real AI provider not tested.** No provider credentials were available. The Anthropic and OpenAI-compatible code paths are implemented. The OpenAI-compatible path was tested over HTTP against a local stub. The Anthropic path has not been run against the real API.
* **Docker images not built.** Docker Hub was blocked in the sandbox. `docker compose config` validates.
* **Prisma native engine not used.** It could not be downloaded, so the migrations were generated from the schema WASM. CI's `prisma migrate diff --exit-code` is the authoritative drift check.
* **IONI not inspected with REA.** `ioni.ai` was blocked by the egress policy, so REA captured nothing. Public pages were reviewed with a web fetch instead (see `docs/RESEARCH.md`).
* **Not covered by automated tests:**
  - SeaweedFS or AWS S3 (only the emulator).
  - OCR.
  - Email delivery.
  - Load and performance.
  - Accessibility audit.
  - Penetration testing.

## Raw output (tail)

```
      Tests  41 passed (41)
   Start at  21:43:21
   Duration  8.12s (tests 70%, import 22%, transform 7%)

VITEST_EXIT=0
  11 passed (30.7s)
```
