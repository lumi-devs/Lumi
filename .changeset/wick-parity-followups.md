---
"@lumi/core": minor
---

**Security**: Added an Advertising Account join-gate filter that flags members whose display name is itself a link or invite (`filter_advertising_enabled`/`filter_advertising_action`), closing a gap identified against Wick's Join Gate.

**Addon SDK**: Added `ConfigRepository.mutateModuleConfig` and `GuildKVRepository.mutateModuleData` - Redis-lock-guarded atomic read-modify-write for one config/KV row, so addon and module code doing get-then-set on a list no longer races a concurrent writer.

**Permits**: Added `/permit export` and `/permit import` for bulk backup/copy of custom permits and their role assignments as JSON.

**Docs**: Documented the previously-undocumented backup/restore ("imaging") system in `docs/modules.md`, the new Join Gate filter, and the deliberate decision to keep the dashboard RPC-split so the bot runs standalone without it.

Also removed two stale worktrees left over from a prior session - their uncommitted diff would have reintroduced three bugs already fixed on `main` (panic-mode serialization/re-show guard, verification-timeout role check, backup restore position tracking).
