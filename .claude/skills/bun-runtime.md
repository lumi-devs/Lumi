# Bun Runtime

Ember runs on [Bun](https://bun.sh) — a fast JS/TS runtime that reads TypeScript natively.
No compile step is required for dev or production.

---

## Key differences vs Node

| Topic | Node (old) | Bun (current) |
|---|---|---|
| Run TypeScript | Needs tsdown → dist/ | `bun src/main.ts` directly |
| Hot reload dev | tsdown --watch + node | `bun --hot src/main.ts` |
| Import aliases | `#lib/*` → `dist/lib/*.js` | `#lib/*` → `src/lib/*.ts` |
| Source maps | `--enable-source-maps` flag | Built-in, always on |
| Package manager | npm / package-lock.json | `bun install` (bun.lockb) |

---

## Scripts

```bash
bun run dev          # hot-reload dev server (bun --hot src/main.ts)
bun run start        # production (bun src/main.ts, no compile)
bun run build        # optional bundle → dist/ (for Docker single-file)
bun run start:dist   # run from dist/ bundle
bun run typecheck    # tsc --noEmit (type checking only)
bun run lint         # eslint fix

# DB tools still use drizzle-kit (via bun)
bun run db:generate
bun run db:migrate
bun run db:studio
```

---

## Import aliases

`package.json` `imports` field maps `#lib/*` → `src/lib/*.ts` so all internal imports work without a compile step.

If you add a new alias:

```jsonc
// package.json
"imports": {
  "#myalias/*": "./src/myalias/*.ts"
}
```

---

## Compatibility notes

| Package | Status |
|---|---|
| ioredis v5 | ✅ Works |
| postgres v3 | ✅ Works |
| discord.js v14 | ✅ Works |
| @sapphire/framework v5 | ✅ Works |
| @sapphire/plugin-scheduled-tasks | ⚠️ BullMQ worker threads — test before shipping |
| bufferutil / utf-8-validate | ⚠️ Native addons, may fail to build. Safe to remove; discord.js falls back to JS |

---

## BullMQ / Scheduled Tasks caveat

`@sapphire/plugin-scheduled-tasks` uses BullMQ which spawns worker threads.
Bun's worker thread support is immature (as of Bun 1.x).

**If tasks fail silently:**
1. Run `bun run legacy:start` temporarily to confirm it's a Bun issue
2. Or replace per-task scheduling with `setInterval` / `node-cron` until Bun's worker thread support matures

---

## Docker

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY src/ ./src/
COPY drizzle.config.ts ./
CMD ["bun", "src/main.ts"]
```

No build step needed. Bun reads TypeScript directly inside the container.

---

## Tips

- **`bun --hot`** hot-reloads modules on file save; state resets on each reload
- **`Bun.env`** reads `.env` automatically — `@skyra/env-utilities` still works on top of it
- **Native addons**: if `bun install` errors on bufferutil/utf-8-validate, add `"optionalDependencies"` or just remove them
- **`bun build`** output is a Bun-native bundle, not Node-compatible; use `--target bun`
