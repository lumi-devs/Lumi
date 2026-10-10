FROM docker.io/oven/bun:1-alpine AS base
WORKDIR /app
RUN apk upgrade --no-cache && apk add --no-cache dumb-init git nodejs

FROM base AS deps
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/infrastructure/package.json packages/infrastructure/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/scheduler/package.json apps/scheduler/package.json
COPY apps/cli/package.json apps/cli/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts && \
    apk add --no-cache --virtual .native-build python3 make g++ npm ada-dev brotli-dev c-ares-dev icu-dev libuv-dev nghttp2-dev openssl-dev simdjson-dev simdutf-dev sqlite-dev zlib-dev zstd-dev && \
    export IVM="$(dirname "$(node -e "console.log(require.resolve('isolated-vm/package.json', { paths: ['/app/packages/core'] }))")")" && \
    (cd "$IVM" && npx -y node-gyp@11 rebuild --release -j max) && \
    mv "$IVM/build/Release/isolated_vm.node" /tmp/isolated_vm.node && \
    rm -rf "$IVM/build" /root/.cache/node-gyp /root/.npm && \
    mkdir -p "$IVM/build/Release" && mv /tmp/isolated_vm.node "$IVM/build/Release/isolated_vm.node" && \
    apk del .native-build

FROM deps AS source
COPY --chown=bun:bun tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY --chown=bun:bun packages/ packages/
COPY --chown=bun:bun prisma/ prisma/
# scripts/ and apps/cli/ back the `lumi` CLI (addon create/validate reuse these
# scripts directly - see apps/cli/src/commands/addon.ts) - copied once here so
# every target image below gets the same `lumi` binary rather than a
# per-target copy that could drift.
COPY --chown=bun:bun scripts/ scripts/
COPY --chown=bun:bun apps/cli/ apps/cli/
RUN mkdir -p /app/data && chown -R bun:bun /app/data && \
    bunx prisma generate && \
    ln -s /app/apps/cli/src/main.ts /usr/local/bin/lumi && \
    bun run scripts/prune-deps.ts

FROM source AS worker
ENV NODE_ENV=production
COPY --chown=bun:bun apps/worker/ apps/worker/
USER bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "exec bun apps/worker/src/main.ts"]

FROM source AS api
ENV NODE_ENV=production
COPY --chown=bun:bun apps/api/ apps/api/
USER bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "exec bun apps/api/src/main.ts"]

FROM source AS scheduler
ENV NODE_ENV=production
COPY --chown=bun:bun apps/scheduler/ apps/scheduler/
USER bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "exec bun apps/scheduler/src/main.ts"]
