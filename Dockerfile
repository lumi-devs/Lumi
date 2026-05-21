# ── Shared base ───────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── Production dependencies (cached as long as bun.lock unchanged) ────────────
FROM base AS deps

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Prisma generate (cached separately — only re-runs when schema changes)
COPY prisma ./prisma
RUN bunx prisma generate

# ── Production stage ──────────────────────────────────────────────────────────
FROM base AS production

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun prisma ./prisma
COPY --chown=bun:bun package.json tsconfig.base.json prisma.config.ts ./

RUN mkdir -p /app/data && chown -R bun:bun /app

USER bun

ENV NODE_ENV=production

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD bun -e "process.exit(0)" || exit 1

CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && bun src/main.ts"]

# ── Development stage (hot-reload, source mounted from host) ──────────────────
FROM base AS development

RUN apk add --no-cache git curl

COPY --chown=bun:bun package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Prisma generate (cached separately — only re-runs when schema changes)
COPY --chown=bun:bun prisma ./prisma
RUN bunx prisma generate

USER bun

ENV NODE_ENV=development

# Source is bind-mounted at runtime; push schema then start with watch-reload
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && bun --watch src/main.ts"]
