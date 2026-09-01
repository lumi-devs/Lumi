---
"@lumi/core": patch
---

Added `defineEnv` and `envField` parser builders (`string`, `integer`, `boolean`) to `packages/core/src/lib/env.ts`. This aggregates all missing and invalid environment variable errors into a single combined startup validation error, ensuring misconfigured deployments fail fast at bootstrap rather than failing mid-request.
