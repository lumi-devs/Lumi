FROM oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache git dumb-init

FROM base AS builder
ENV NODE_ENV=development

COPY package.json bun.lock ./
COPY packages/ packages/
COPY apps/ apps/
COPY prisma/ prisma/

RUN bun install --frozen-lockfile
RUN bunx prisma generate

FROM base AS runner
ENV NODE_ENV=production

COPY package.json bun.lock ./
COPY prisma/ prisma/

RUN bun install --frozen-lockfile --production
COPY --from=builder /app/prisma/generated ./prisma/generated
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps

RUN mkdir -p /app/data
USER bun

ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "apps/worker/src/main.ts"]

