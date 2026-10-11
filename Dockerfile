FROM docker.io/oven/bun:1-alpine AS base
WORKDIR /app
RUN apk upgrade --no-cache && apk add --no-cache dumb-init git nodejs

FROM base AS deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

FROM deps AS source
COPY --chown=bun:bun tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY --chown=bun:bun src/ src/
COPY --chown=bun:bun prisma/ prisma/
COPY --chown=bun:bun scripts/ scripts/
RUN mkdir -p /app/data && chown -R bun:bun /app/data && \
    bunx prisma generate && \
    ln -s /app/src/cli/Main.ts /usr/local/bin/lumi

FROM source AS bot
ENV NODE_ENV=production
USER bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "exec bun src/Index.ts"]
