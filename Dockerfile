FROM docker.io/oven/bun:1-alpine AS base
WORKDIR /app
RUN apk upgrade --no-cache && apk add --no-cache dumb-init

FROM base AS deps
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/scheduler/package.json apps/scheduler/package.json
COPY apps/cli/package.json apps/cli/package.json
RUN bun install --frozen-lockfile

FROM deps AS source
COPY tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY packages/ packages/
COPY prisma/ prisma/
# scripts/ and apps/cli/ back the `lumi` CLI (addon create/validate reuse these
# scripts directly - see apps/cli/src/commands/addon.ts) - copied once here so
# every target image below gets the same `lumi` binary rather than a
# per-target copy that could drift.
COPY scripts/ scripts/
COPY apps/cli/ apps/cli/
RUN ln -s /app/apps/cli/src/main.ts /usr/local/bin/lumi

FROM source AS worker
ENV NODE_ENV=production
COPY apps/worker/ apps/worker/
RUN bunx prisma generate && mkdir -p /app/data && chown -R bun:bun /app
USER bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "exec bun apps/worker/src/main.ts"]

FROM source AS api
ENV NODE_ENV=production
COPY apps/api/ apps/api/
RUN bunx prisma generate && chown -R bun:bun /app
USER bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "exec bun apps/api/src/main.ts"]

FROM source AS scheduler
ENV NODE_ENV=production
COPY apps/scheduler/ apps/scheduler/
RUN bunx prisma generate && chown -R bun:bun /app
USER bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "exec bun apps/scheduler/src/main.ts"]
