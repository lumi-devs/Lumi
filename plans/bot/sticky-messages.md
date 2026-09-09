# Sticky Messages

## What it does

Re-posts a configured message to the bottom of a channel every time a new message is sent there.
Old sticky post is deleted before the new one goes up (keeps the channel clean).

## Module location

`packages/core/src/modules/sticky/`

## Config schema

```ts
@DefineModule({ name: "sticky", displayName: "Sticky Messages", emoji: "📌", ... })
cfg.object({
  entries: cfg.array(cfg.object({
    channel_id: cfg.channel({ label: "Channel", ... }),
    message:    cfg.string({ label: "Message", ... }),
    enabled:    cfg.boolean({ label: "Enabled", default: true }),
  })),
})
```

**ASK:** Per-channel stickies (array) or one per guild? Components V2 embed support in v1 or plain text only?

## Listener

`listeners/messageCreate.ts`:
1. Load sticky config for guild
2. Find entry matching `message.channelId`
3. If found and enabled:
   - Delete previous sticky message ID (stored in Redis: `sticky:{guildId}:{channelId}`)
   - Post new sticky message
   - Store new message ID in Redis

## Storage

Redis key: `lumi:sticky:{guildId}:{channelId}` → last sticky message ID  
TTL: none (sticky until config removed)

## Edge cases

- Bot lacks send/delete perms → log error, do not throw
- Message is from the bot itself → skip (prevent infinite loop)
- Cooldown: min 1s between re-posts per channel (avoid spam on burst messages)

## Files

| File | Purpose |
|------|---------|
| `index.ts` | `@DefineModule` + config schema |
| `listeners/messageCreate.ts` | Core repost logic |
| `lib/sticky-store.ts` | Redis get/set for last message ID |
| `manifest.json` | Module manifest |
