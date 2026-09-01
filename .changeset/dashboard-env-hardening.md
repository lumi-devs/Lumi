---
"@lumi/dashboard": patch
---

Replaced the loose `getEnv(name, fallback="")` helper in `apps/dashboard/src/lib/env.ts` with strict `envStr` and `envInt` parsers that throw on missing required variables instead of silently returning empty strings. Added `resolveAuthSecret` to consolidate the `DASHBOARD_SESSION_SECRET`/`AUTH_SECRET` fallback chain. Semantics now match `packages/core`'s `envParseString`/`envParseInteger` — a misconfigured deployment fails fast at startup rather than at the first request.
