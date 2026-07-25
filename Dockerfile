FROM oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache git

FROM base AS deps
COPY package.json bun.lock* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/core/package.json ./packages/core/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY packages/observability/package.json ./packages/observability/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/sharding/package.json ./packages/sharding/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY apps/worker/package.json ./apps/worker/
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/scheduler/package.json ./apps/scheduler/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY prisma ./prisma

RUN bun install --no-frozen-lockfile && bunx prisma generate

FROM base AS production
ENV NODE_ENV=production

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=deps --chown=bun:bun /app/prisma/generated ./prisma/generated
COPY --chown=bun:bun packages ./packages
COPY --chown=bun:bun apps ./apps
COPY --chown=bun:bun prisma ./prisma
COPY --chown=bun:bun package.json tsconfig.base.json tsconfig.json turbo.json eslint.config.mjs prisma.config.ts ./

RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

CMD ["sh", "-c", "bunx prisma migrate deploy && bun apps/worker/src/main.ts"]

FROM base AS development
WORKDIR /app
ENV NODE_ENV=development

RUN mkdir -p /app && chown -R bun:bun /app
USER bun

COPY --chown=bun:bun package.json bun.lock* ./
COPY --chown=bun:bun packages/contracts/package.json ./packages/contracts/
COPY --chown=bun:bun packages/core/package.json ./packages/core/
COPY --chown=bun:bun packages/eslint-config/package.json ./packages/eslint-config/
COPY --chown=bun:bun packages/event-bus/package.json ./packages/event-bus/
COPY --chown=bun:bun packages/observability/package.json ./packages/observability/
COPY --chown=bun:bun packages/sdk/package.json ./packages/sdk/
COPY --chown=bun:bun packages/sharding/package.json ./packages/sharding/
COPY --chown=bun:bun packages/typescript-config/package.json ./packages/typescript-config/
COPY --chown=bun:bun apps/worker/package.json ./apps/worker/
COPY --chown=bun:bun apps/gateway/package.json ./apps/gateway/
COPY --chown=bun:bun apps/scheduler/package.json ./apps/scheduler/
COPY --chown=bun:bun apps/dashboard/package.json ./apps/dashboard/

RUN bun install --frozen-lockfile
COPY --chown=bun:bun prisma ./prisma
RUN bunx prisma generate

CMD ["sh", "-c", "bun install && bunx prisma db push --accept-data-loss && bun --watch apps/worker/src/main.ts"]
