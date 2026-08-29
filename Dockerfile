FROM docker.io/oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

FROM base AS builder
ENV NODE_ENV=development

COPY package.json bun.lock tsconfig.base.json tsconfig.json turbo.json prisma.config.ts ./
COPY packages/ packages/
COPY apps/worker/ apps/worker/
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY prisma/ prisma/

RUN bun install --frozen-lockfile
RUN bunx prisma generate

FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker ./apps/worker
COPY package.json bun.lock prisma.config.ts ./

RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "bunx prisma migrate deploy && bun apps/worker/src/main.ts"]
