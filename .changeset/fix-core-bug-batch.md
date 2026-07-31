---
"@lumi/core": patch
"@lumi/dashboard": patch
---

Bug-fix batch: quarantine cases now record `quarantine`/`unquarantine` actions (fixing the dead rejoin re-enforcement DB fallback) and lift stale cases on apply/undo; repository `getOrSet` gains single-flight dedup and no longer caches `undefined`; GUILD_CREATE entity-cache writes are pipelined instead of sequential; RabbitMQ `publishEvent` catches and logs publish failures centrally; empty catch blocks now log at debug; the unused `TRANSPORT` env var and dead `RestrictAction`/`BaseAction` scaffolding are removed; `INTERACTION_DEFER_AT_GATEWAY` defaults to enabled.
