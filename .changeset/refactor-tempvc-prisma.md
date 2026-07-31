---
"@lumi/core": minor
---

Migrate the `tempvc` module off the generic `ModuleData` KV store onto dedicated
Prisma tables (`TempVcGenerator`, `TempVcRecord`) via a new `TempVcRepository`.
Built-in modules now own real tables end to end; the KV store is reserved for
third-party addons. The module's in-memory registry and InvalidationBus behaviour
are unchanged. Note: existing tempvc generators stored under the old KV rows are
not auto-migrated (temp channels are ephemeral); re-create generators after deploy.
