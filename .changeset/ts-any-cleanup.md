---
'@lumi/core': patch
'@lumi/docs': patch
---

Replace `any` escape hatches with `unknown` + narrowing in error handling, fix a deprecated discord.js `ephemeral` option, remove unused docs dependencies, add a properly-configured `knip.json` and remove the dead code it found, and consolidate 3 duplicated `execFile`/sleep helpers onto `Bun.spawn`/`Bun.sleep`
