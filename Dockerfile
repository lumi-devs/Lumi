FROM docker.io/oven/bun:1.4.2-alpine AS base
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
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build bun run db:generate
RUN bun run build

FROM docker.io/oven/bun:1.4.2-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache \
    postgresql-client \
    redis \
    vips \
    cairo \
    pango \
    giflib \
    curl

COPY --from=base --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=base --chown=1000:1000 /app/dist ./dist
COPY --from=base --chown=1000:1000 /app/packages ./packages
COPY --from=base --chown=1000:1000 /app/modules ./modules
COPY --from=base --chown=1000:1000 /app/tsconfig.json ./tsconfig.json
COPY --from=base --chown=1000:1000 /app/package.json ./package.json
COPY --from=base --chown=1000:1000 /app/bunfig.toml ./bunfig.toml
COPY --from=base --chown=1000:1000 /app/prisma.config.ts ./prisma.config.ts

COPY --chown=1000:1000 config/postgresql.conf /etc/postgresql/postgresql.conf
COPY --chown=1000:1000 config/redis.conf /usr/local/etc/redis/redis.conf

RUN mkdir -p /app/data/addons && chown -R 1000:1000 /app/data

USER bun
EXPOSE 8091 9090

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:9090/healthz || exit 1

ENTRYPOINT ["bun"]
CMD ["dist/index.js"]
