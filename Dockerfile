FROM docker.io/oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

FROM base AS deps
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/docs/package.json apps/docs/package.json
RUN bun install --frozen-lockfile

FROM deps AS source
COPY tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY packages/ packages/
COPY prisma/ prisma/

FROM source AS worker
ENV NODE_ENV=production
COPY apps/worker/ apps/worker/
RUN bunx prisma generate && mkdir -p /app/data && chown -R bun:bun /app
USER bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "bunx prisma migrate deploy && exec bun apps/worker/src/main.ts"]

FROM source AS dashboard-build
ENV NODE_ENV=production \
    SKIP_ENV_VALIDATION=1 \
    RPC_HTTP_URL=http://127.0.0.1:8091 \
    DISCORD_OAUTH2_CLIENT_ID=build-placeholder \
    DISCORD_OAUTH2_CLIENT_SECRET=build-placeholder \
    DASHBOARD_SESSION_SECRET=build-placeholder-session-secret-must-be-32chars
COPY apps/dashboard/ apps/dashboard/
RUN bun run --filter=@lumi/dashboard build

FROM base AS dashboard
RUN apk add --no-cache nodejs
ENV NODE_ENV=production
COPY --from=dashboard-build --chown=bun:bun /app/apps/dashboard/.next/standalone ./
COPY --from=dashboard-build --chown=bun:bun /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=dashboard-build --chown=bun:bun /app/apps/dashboard/public ./apps/dashboard/public
USER bun
EXPOSE 8080
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "PORT=${DASHBOARD_PORT:-8080} HOSTNAME=${DASHBOARD_HOST:-0.0.0.0} exec node apps/dashboard/server.js"]
