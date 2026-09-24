# Giveaways (Addon)

## Status of existing work

`examples/giveaway/` is a near-complete reference implementation:
- `/giveaway start` command
- Entry button interaction handler
- Reroll interaction handler
- `lib/store.ts` — Redis-backed entry sets
- `lib/announce.ts` — winner announcement
- `lib/modals.ts` — edit-prize modal
- Scheduled task fired by `registerTaskFireHandler("giveaway-end", ...)`

## What to do

Move or copy `examples/giveaway/` into the addon workspace.

**ASK:** Does `lumi-addons/` exist as a separate workspace/repo, or do addons live in `examples/`?
If it's a new dir, does it need its own `package.json` + turbo pipeline, or piggybacks on `packages/core`?

## Features beyond the example

**ASK:** Which of these are in scope before shipping?
- Required role to enter (role gate on the entry button)
- Bonus entries (e.g. boosters get 2x)
- Multiple winners (`winner_count` already in schema as `default_winner_count`)
- Reroll by host after end

## Config schema (already in example)

```ts
cfg.object({
  default_winner_count: cfg.number({ label: "Default Winner Count", default: 1, min: 1, max: 20 }),
})
```

## Commands

`/giveaway start` — prize, duration, winners, channel  
`/giveaway end` — end early  
`/giveaway reroll` — pick new winner(s)  
`/giveaway list` — active giveaways in guild  

## Data model

Existing example uses Redis for entry sets. Persistent giveaway records (prize, end time, winner IDs)
need a DB table or Redis hash. Check if the example's `store.ts` already persists to Prisma or Redis only.

## Files (from examples/giveaway — move as-is then extend)

```
<addon-root>/giveaway/
  commands/giveaway.ts
  interaction-handlers/giveaway-button.ts
  interaction-handlers/giveaway-editprize-modal.ts
  interaction-handlers/giveaway-reroll.ts
  lib/announce.ts
  lib/modals.ts
  lib/store.ts
  index.ts
  manifest.json
  info.json
```
