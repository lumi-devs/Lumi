---
"@lumi/core": patch
"@lumi/worker": patch
---

Export `@lumi/core/env` subpath for lightweight runtime bootstrap and replace direct `process.env` bypasses across core and worker with unified env accessors.
