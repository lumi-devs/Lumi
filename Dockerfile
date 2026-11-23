# syntax=docker/dockerfile:1.4
FROM docker.io/oven/bun:1.4.4-alpine AS base
WORKDIR /app
ENV TMPDIR=/tmp

RUN apk add --no-cache \
    postgresql-client \
    redis \
    python3 \
    make \
    g++ \
    vips-dev \
    cairo-dev \
    pango-dev \
    giflib-dev

COPY . .
RUN bun install --frozen-lockfile --production
RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder bun run db:generate
RUN bun run build

FROM docker.io/oven/bun:1.4.4-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache \
    postgresql-client \
    redis \
    vips \
    cairo \
    pango \
    giflib \
    curl \
    tini

COPY --from=base --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=base --chown=1000:1000 /app/dist ./dist
COPY --from=base --chown=1000:1000 /app/packages ./packages
COPY --from=base --chown=1000:1000 /app/modules ./modules
COPY --from=base --chown=1000:1000 /app/tsconfig.json ./tsconfig.json
COPY --from=base --chown=1000:1000 /app/package.json ./package.json
COPY --from=base --chown=1000:1000 /app/bunfig.toml ./bunfig.toml
COPY --from=base --chown=1000:1000 /app/prisma.config.ts ./prisma.config.ts

RUN mkdir -p /app/data/addons && chown -R 1000:1000 /app/data

USER bun
EXPOSE 8091 9090

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8091/healthz || exit 1

ENTRYPOINT ["tini", "--", "bun"]
CMD ["dist/index.js"]
