---
"@lumi/core": patch
---

Fix several concurrency and correctness issues found in an audit pass: RPC actor authorization on privileged core-rpc handlers (`repoAdd`, `repoList`, `repoModules`, `systemDashboardGet`), a mod-lift handler crash on `voice_mute` cases, and related regression coverage.
