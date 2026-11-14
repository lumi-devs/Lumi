# Framework: Utilities

## Formatting and cards

Never construct `new EmbedBuilder()` in a command. Code blocks
and inline code come from `codeBlock` / `inlineCode` in
`@discordjs/formatters`. Chat-input mentions use
`chatInputApplicationCommandMention` from the same package.
embeds come from the card builders in `src/lib/ui/Cards.ts`
(`makeSuccessCard`, `makeErrorCard`, `makeInfoCard`, `makeWarningCard`,
`makeListCard`) or the `ctx.reply*` shortcuts.

## Filters

`src/lib/discord/Filters.ts`: the URL filter primitives behind the
filter module's rule engine.

## Bulk delete

```ts
import { massPurge } from "@discord/MassPurge.js";

const { deleted, scanned } = await massPurge(services, channel, {
  limit: 100,
  filter: (m) => m.author.id === userId,
  matchIds: async (messages) => matchedIds,
  excludeIds: new Set([prompt.id]),
});
```

Under-14-day messages go through `bulkDelete` (with split-retry on
unknown-message races); older ones fall back to slow single deletes.

## Time, snowflakes, durations

`src/lib/utilities/Time.ts` (`parseDuration`, `formatDuration`),
`src/lib/utilities/Snowflakes.ts` (`isSnowflakeId`),
`src/lib/utilities/Pagination.ts` (`paginateList` for button-paged
output), `src/lib/utilities/Autocomplete.ts` (choice filtering).
