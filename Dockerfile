FROM oven/bun:1-alpine AS base
WORKDIR /app
# Need git for dynamic module loading
RUN apk add --no-cache git

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY prisma ./prisma
RUN bunx prisma generate

FROM base AS production
ENV NODE_ENV=production

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun prisma ./prisma
COPY --chown=bun:bun package.json tsconfig.base.json prisma.config.ts ./

RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

CMD ["sh", "-c", "bunx prisma migrate deploy && bun src/main.ts"]

FROM base AS development
WORKDIR /app
ENV NODE_ENV=development

# Ensure the app directory exists and is owned by the bun user
RUN mkdir -p /app && chown -R bun:bun /app

USER bun

COPY --chown=bun:bun package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY --chown=bun:bun prisma ./prisma
RUN bunx prisma generate

# Push schema and accept data loss for quick local dev iteration
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && bun run dev"]
