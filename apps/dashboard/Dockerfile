# syntax=docker/dockerfile:1.4
FROM docker.io/oven/bun:1.4.4-alpine AS base
WORKDIR /app

COPY package.json bunfig.toml bun.lock prisma.config.ts ./
COPY packages/ ./packages/
COPY modules/shared/ ./modules/shared/
COPY apps/dashboard/package.json ./apps/dashboard/

RUN bun install --frozen-lockfile --ignore-scripts
RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder bun run db:generate

COPY apps/dashboard/ ./apps/dashboard/
WORKDIR /app/apps/dashboard
RUN bun run sync
RUN bun run build

FROM docker.io/oven/bun:1.4.4-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache \
    curl \
    tini

COPY --from=base --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=base --chown=1000:1000 /app/packages ./packages
COPY --from=base --chown=1000:1000 /app/apps/dashboard/build ./build
COPY --from=base --chown=1000:1000 /app/apps/dashboard/package.json ./package.json

USER bun
EXPOSE 4173

ENV PORT=4173
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:4173/healthz || exit 1

ENTRYPOINT ["tini", "--", "bun"]
CMD ["build/index.js"]
