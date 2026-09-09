# Channel Not Found — Self-Claim Flow

## What user wants

When configured log channel no longer exists (deleted/bot kicked), show user a **copyable message** they can paste into any channel or thread. Bot picks it up, updates config automatically.

## How it works

### Bot side (`packages/core`)

Message listener watches for claim token pattern in any channel or thread the bot can see.

Thread support: if the message was sent in a thread, resolve to the parent channel:
```ts
if (message.channel.isThread()) {
  targetChannelId = message.channel.parentId;
} else {
  targetChannelId = message.channel.id;
}
```

When claim token seen:
1. Validate token (guild ID + field key + nonce stored server-side with TTL)
2. Update guild config: set `log_channel_id` (or whichever field) to resolved channel
3. Publish dashboard event so UI refreshes

Claim token format:
```
/lumi-claim log log_channel_id abc123def456
```

### Dashboard side

When channel field value references a channel not in `data.channels`:
- Show inline warning: "This channel no longer exists."
- Show **"Claim new channel"** button
- Clicking generates/fetches claim token from API, shows copy box:

```
┌─────────────────────────────────────────────────────┐
│ Paste this in any channel or thread Lumi can see:   │
│                                                      │
│ /lumi-claim log log_channel_id abc123def456  [Copy] │
│                                                      │
│ Lumi will update your log channel automatically.    │
└─────────────────────────────────────────────────────┘
```

Dashboard polls (or WebSocket/SSE) for claim fulfillment, then refreshes field value.

### API

`POST /api/guilds/[guildId]/log-claims` — generate nonce, store server-side (Redis/DB with TTL), return claim string.

Bot message handler calls same backend to validate + consume nonce.

## Files to touch

1. `packages/core/src/modules/logging/` — claim message listener (with thread→parent resolution)
2. `apps/dashboard/src/app/api/guilds/[guildId]/log-claims/route.ts` — generate claim nonce
3. `apps/dashboard/src/components/guild/config-field-input.tsx` — "channel not found" state + claim UI
4. `apps/dashboard/src/lib/dashboard-fetch.ts` — extend `getGuildLogClaims`

## Existing infrastructure

`LogClaimsCard` and `getGuildLogClaims` already exist in codebase — this extends them to cover the "channel deleted" recovery case.
