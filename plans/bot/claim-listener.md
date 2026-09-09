# Bot-Side Claim Listener

## Purpose

When a configured log channel (or any channel-ID config field) no longer exists — bot was kicked, channel deleted — the dashboard shows a copyable claim token. The user pastes it into any channel or thread visible to Lumi, and the bot updates the config automatically.

## Message listener

Module: `packages/core/src/modules/logging/` (or central `message` handler)

Watch every incoming message for:

```ts
const CLAIM_PATTERN = /^\/lumi-claim\s+(\S+)\s+(\S+)\s+([a-f0-9]{12,})$/;
```

Capture groups:
1. Module key (e.g. `log`)
2. Config field key (e.g. `log_channel_id`)
3. Nonce

### Thread-aware channel resolution

```ts
const targetChannelId = message.channel.isThread()
  ? message.channel.parentId
  : message.channel.id;
```

The bot updates the config to `targetChannelId`. This lets users paste the claim message in any channel OR any thread — the resulting binding is always a real text channel (not a thread).

## Server-side nonce

Stored in Redis (or DB) with short TTL (e.g. 5 minutes):

```
key: lumi:claim:{guildId}:{nonce}
value: { fieldKey, moduleKey }
ttl: 300s
```

API endpoint (`POST /api/guilds/[guildId]/log-claims`):
- Generates nonce (`crypto.randomBytes(6).hex()`)
- Stores claim in Redis
- Returns full claim string to dashboard

Bot handler:
- Validates nonce exists for guild
- Atomically deletes (consume once)
- Updates guild config via normal config API

## Security

- One-time nonce — cannot be replayed
- TTL ensures expiry
- Only updates the specific field indicated in the claim record — no arbitrary write
- Bot checks that the guild member who originally triggered the dashboard claim is the same one who sent the bot claim message (author ID stored with nonce)

## Files to touch

1. `packages/core/src/modules/logging/claim-listener.ts` — new file, message handler
2. `apps/dashboard/src/app/api/guilds/[guildId]/log-claims/route.ts` — generate + store nonce
3. Redis integration in `packages/core/src/lib/redis.ts` (or equivalent)
