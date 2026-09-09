# Auto-Cleanup on Channel/Role Deletion

## What it does

When a channel or role that's referenced in any module config is deleted, silently null out
that config field rather than leaving a stale ID that causes errors or "channel not found" banners.

## Listeners needed

- `channelDelete` → scan all guild module configs for `channel_id`-type fields containing the deleted channel ID → set to null
- `roleDelete` → same for `role_id`-type fields

## How to find stale references

Two options:

**Option A — Scan all config on event**  
On `channelDelete`, load `GuildConfig` record for the guild, walk all module config keys,
check if any `channel_id` field equals `deletedChannel.id`, patch those to null.

Downside: full config scan on every channel delete. Fast enough for most guilds.

**Option B — Reverse index**  
On config save, maintain a Redis set `lumi:chanrefs:{guildId}:{channelId}` → set of `moduleKey:fieldKey` paths.
On delete, look up the set, patch only those fields.

Downside: more complex, needs to stay in sync with config writes.

**ASK:** Option A or B? Or is there an existing config write path that makes one obviously easier?

## Notification vs silent

**ASK:** Silent null (user discovers it on next dashboard visit) or post a message to a configured
admin/log channel saying "Channel #old-logs was deleted; logging channel config was cleared"?

## Files to touch

1. `packages/core/src/modules/core/listeners/channelDelete.ts` — new listener (or add to existing)
2. `packages/core/src/modules/core/listeners/roleDelete.ts` — new listener
3. `packages/core/src/lib/prisma/DatabaseService.ts` — config patch helper (or use existing)

**ASK:** Is there a `core` module that owns guild-level lifecycle events, or does each module register its own channel/role delete listeners?
