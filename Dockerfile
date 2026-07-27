FROM oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache git
RUN mkdir -p /app/data

FROM base AS builder
ENV NODE_ENV=development

COPY package.json bun.lock tsconfig.base.json tsconfig.json turbo.json prisma.config.ts ./
COPY packages/ packages/
COPY apps/ apps/
COPY prisma/ prisma/

RUN bun install --no-frozen-lockfile --ignore-scripts
RUN bunx prisma generate
RUN bun run build 2>/dev/null; exit 0

FROM base AS runner
ENV NODE_ENV=production
ENV BUN_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma/generated ./prisma/generated
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/package.json ./

USER bun

CMD ["sh", "-c", "bun apps/worker/src/main.ts"]
