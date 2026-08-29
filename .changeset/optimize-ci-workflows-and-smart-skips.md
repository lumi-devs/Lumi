---
"@lumi/core": patch
"@lumi/dashboard": patch
"@lumi/worker": patch
---

Optimize GitHub Actions CI/CD workflows and automated checks:
- Implement granular paths filtering in `ci.yml` and `docker.yml` to smart-skip jobs on markdown/docs/unrelated changes.
- Add `ci-status` aggregator job in `ci.yml` (`if: always()`) for robust GitHub branch protection evaluation without false failures on skipped matrix jobs.
- Enable Turborepo and Bun local caching in GitHub Actions runners across all workflows.
- Streamline `changeset-check.yml` by eliminating redundant Bun setup and dependency installations.
- Set `NEXT_TELEMETRY_DISABLED=1` and `SKIP_ENV_VALIDATION=1` in CI environment.
