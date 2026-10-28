# syntax=docker/dockerfile:1.7
# Amanta – multi-target image.
#   web:    Next.js standalone server (small runtime, non-root)
#   worker: background jobs + migrations/seed tooling (full node_modules)
# Pin the base image by digest in production (docker buildx imagetools inspect node:24-bookworm-slim).
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npx prisma generate && npx next build

FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

FROM build AS worker
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "tsx", "--conditions=react-server", "src/worker/index.ts"]
