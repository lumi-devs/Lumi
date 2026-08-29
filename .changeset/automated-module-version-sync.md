---
"@lumi/core": minor
---

**Module System & Release Versioning**: Built-in modules now dynamically inherit the bot release version (`CoreVersion` from `packages/core/package.json`), matching standard modular bot architecture. Removed manual static module version strings in favor of automated manifest synchronization during Changesets releases via `bun run version:sync`.
