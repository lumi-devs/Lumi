# Vanity Roles (Addon)

## What it does

Assign a configured role to members who put the server's vanity URL in their status/about-me.
Auto-remove when they remove it.

## Hard blocker — verify before starting

Discord only exposes member custom status via `presenceUpdate`, which requires `GatewayIntentBits.GuildPresences`.

**ASK:** Is `GuildPresences` intent enabled in Lumi's bot startup config? Where is the intent list defined?
If not enabled: this feature cannot work without adding it (privileged intent — requires Discord approval for large bots).

## How it works (if intent is available)

1. `presenceUpdate` listener fires when a member's presence changes
2. Check `newPresence.activities` for `ActivityType.Custom` — look at `state` field for `guild.vanityURLCode`
3. If vanity URL found in status → assign configured role
4. If vanity URL removed → remove the role

## Config schema

```ts
cfg.object({
  enabled:  cfg.boolean({ label: "Enabled", default: false }),
  role_id:  cfg.role({ label: "Vanity Role", description: "Assigned while member has vanity URL in status" }),
})
```

## Edge cases

- Bot role must be above the vanity role in hierarchy — emit a setup warning if not
- Member leaves guild while having role → no cleanup needed (roles go with them)
- Vanity URL changes (guild changes it) → update what we're looking for on `guildUpdate`

## Files

```
<addon-root>/vanity-roles/
  index.ts
  listeners/presenceUpdate.ts
  listeners/guildUpdate.ts   (keep vanity URL cache fresh)
  manifest.json
```
