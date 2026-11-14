FROM docker.io/oven/bun:1.4.2-alpine AS base
WORKDIR /app

COPY package.json bunfig.toml ./
COPY packages/ ./packages/
COPY apps/dashboard/package.json ./apps/dashboard/

RUN bun install --production

COPY apps/dashboard/ ./apps/dashboard/
WORKDIR /app/apps/dashboard
RUN bun run build

FROM docker.io/oven/bun:1.4.2-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache curl

COPY --from=base --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=base --chown=1000:1000 /app/packages ./packages
COPY --from=base --chown=1000:1000 /app/apps/dashboard/build ./build
COPY --from=base --chown=1000:1000 /app/apps/dashboard/package.json ./package.json

USER bun
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

ENTRYPOINT ["bun"]
CMD ["build/index.js"]
