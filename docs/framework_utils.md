# Framework: Utilities

## Formatting and cards

Never construct `new EmbedBuilder()` in a command. Pure string formatting
lives in `src/lib/ui/Format.ts` (`box`, `pagify`, headers, escapes);
embeds come from the card builders in `src/lib/ui/Cards.ts`
(`makeSuccessCard`, `makeErrorCard`, `makeInfoCard`, `makeWarningCard`,
`makeListCard`) or the `ctx.reply*` shortcuts. `api.ui` / `api.fmt`
expose both per guild.

## Antispam

```ts
const spam = api.spam("join-burst", [{ windowMs: 10_000, limit: 5 }]);
await spam.stamp(userId);
await spam.isSpammy(userId);
```

Valkey-backed sliding windows (`src/lib/utilities/AntiSpam.ts`).

## Filters

`src/lib/discord/Filters.ts`: URL/invite/mass-mention filters,
smart-quote normalization, spoiler escaping - the primitives behind the
filter module's rule engine.

## Bulk delete

```ts
import { massPurge } from "#src/lib/discord/MassPurge.js";

const { deleted, scanned } = await massPurge(services, channel, {
  limit: 100,
  filter: (m) => m.author.id === userId,
  matchIds: async (messages) => matchedIds,
  excludeIds: new Set([prompt.id]),
});
```

Under-14-day messages go through `bulkDelete` (with split-retry on
unknown-message races); older ones fall back to slow single deletes.

## Tunnel

Two-way DM relay for modmail-style flows (`src/lib/discord/Tunnel.ts`):

```ts
const tunnel = await Tunnel.open(services, staffUser, memberUser);
await tunnel.close("Done.");
```

Forwards content + attachments both ways with an author header, ignores
bots, closes on timeout (30 min default) or explicitly.

## Time, snowflakes, durations

`src/lib/utilities/Time.ts` (`parseDuration`, `formatDuration`),
`src/lib/utilities/Snowflakes.ts` (`isSnowflakeId`),
`src/lib/utilities/Pagination.ts` (`paginateList` for button-paged
output), `src/lib/utilities/Autocomplete.ts` (choice filtering).
