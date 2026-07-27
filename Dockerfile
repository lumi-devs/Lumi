FROM oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache git dumb-init

FROM base AS builder
ENV NODE_ENV=development

COPY package.json bun.lock prisma.config.ts ./
COPY packages/ packages/
COPY apps/ apps/
COPY prisma/ prisma/

RUN bun install --frozen-lockfile
RUN bunx prisma generate

FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY package.json bun.lock prisma.config.ts ./

RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && bun apps/worker/src/main.ts"]
