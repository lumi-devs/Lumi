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
COPY apps/docs/package.json apps/docs/package.json
RUN bun install --frozen-lockfile

FROM deps AS source
COPY tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY packages/ packages/
COPY prisma/ prisma/

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
