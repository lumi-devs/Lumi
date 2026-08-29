---
"@lumi/dashboard": patch
"@lumi/worker": patch
"@lumi/core": patch
---

Hardened GitHub Actions CI/CD workflows and container build pipeline:
- Add safe build-time environment variable fallbacks in `@lumi/dashboard` for Next.js static page collection.
- Optimized multi-stage `Dockerfile` and `Dockerfile.dashboard` for lightweight Alpine container execution.
- Added comprehensive Turborepo build verification job to `ci.yml`.
- Standardized PR, Push, and Merge Queue (`merge_group`) triggers across all workflows.
