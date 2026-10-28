# Deployment

## Components

| Component | Image or command | Scaling |
|---|---|---|
| Web | `Dockerfile` target `web`, which runs `node server.js` (Next.js standalone) | Stateless. Scale horizontally behind a TLS-terminating proxy. |
| Worker | Target `worker`, which runs `tsx --conditions=react-server src/worker/index.ts` | Run 1 or more replicas. pg-boss handles locking. |
| Migrations | Target `worker`, which runs `npx prisma migrate deploy && tsx scripts/init-storage.ts` | Run once per release, before web and worker. |
| PostgreSQL | 15 or newer (17 is used in compose and CI) | Managed service recommended, with PITR backups. |
| Object storage | Any S3-compatible service: AWS S3, Cloudflare R2, Wasabi, SeaweedFS, Ceph RGW | Private bucket. Enable versioning and SSE. |

## Environment

See `.env.example` for the full list. Production settings:

* `COOKIE_SECURE=true`, and serve only over HTTPS. `APP_URL` must be the public HTTPS URL.
* `APP_ENCRYPTION_KEY` is 32 random bytes, base64-encoded, kept in a secret manager.
* `STORAGE_DRIVER=s3` and `S3_SSE=AES256` (or KMS, depending on the provider).
* For `AI_PROVIDER`, `anthropic` or `openai` with a key, or `none`.
* The worker needs the same environment as the web app.

## Release procedure

1. Run `docker build --target web -t amanta-web:<ver> .` and `docker build --target worker -t amanta-worker:<ver> .`.
2. Run migrations with the worker image: `npx prisma migrate deploy`.
3. Roll out web and worker.
4. Smoke test: `GET /api/health` should return `{"status":"ok"}`, then log in and open the dashboard.

## Prisma migrations note

`prisma/migrations/20261028000000_init` was generated from `schema.prisma` by `scripts/generate-migration-sql.mjs`, which uses the official Prisma schema WASM and Prisma's naming conventions. The build sandbox could not download Prisma's native schema engine.

In any environment with internet access:

```bash
npx prisma migrate deploy                       # applies migrations and records them in _prisma_migrations
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code   # must exit 0
```

CI runs both commands. For later schema changes, use `npx prisma migrate dev --name <change>` as usual. `scripts/db-migrate.mjs` is an offline fallback that writes the same `_prisma_migrations` checksum records.

## Backups and retention

* Back up PostgreSQL daily, with point-in-time recovery. Back up object storage with versioning plus lifecycle rules.
* The audit log is append-only. Purging it requires an explicit `SET LOCAL amanta.allow_audit_purge = 'on'` inside a transaction. Document any purge, for example when offboarding a tenant.
* Retention periods for food-safety records come from your regulator and customers. Amanta does not delete records automatically.

## Observability

* The worker writes structured JSON logs (`job.done`, `job.failed`).
* Server errors appear in the web logs. Users see only an error digest.
* Health endpoint: `GET /api/health` returns 200 or 503 and does not reveal configuration.
