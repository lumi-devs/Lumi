# UI

Package: `@lumi/ui` (`packages/ui`). The single rendering layer for every
user-facing message.

Discord embeds are banned across the entire repository. Do not import
`EmbedBuilder`, do not pass `embeds:` to any Discord call, and do not build
message payloads outside this package. All output is a Components V2 card.

## Cards

- `makeInfoCard(title, body, opts)`
- `makeSuccessCard(title, body, opts)`
- `makeWarningCard(title, body, opts)`
- `makeErrorCard(title, body, opts)`
- `makeCard(color, title, body, opts)` for a custom accent colour
- `makeListCard(title, items, opts)` caps at 25 visible items
- `makeEmptyCard(title, reason, suggestion, opts)`
- `ephemeralCard(card)` marks a reply private
- `noPingCard(card)` suppresses mention parsing

`CardOptions`: `subtitle`, `breadcrumbs`, `statusBadge`, `footer`,
`thumbnailUrl`, `divider`, `hideTitle`, `noAccent`, `sections`, `actionRows`,
`separatorAboveActionRows`, `mediaGallery`, `headerImages`.

`body` accepts a string or an array of strings. Array entries become separated
text blocks.

## Sending

`CardReply` already carries `flags: MessageFlags.IsComponentsV2` and
`allowedMentions: { parse: [] }`.

```ts
await interaction.reply(card);
await interaction.editReply(card);
await interaction.update(card);
await message.reply(card);
await channel.send(card);
await interaction.reply(ephemeralCard(makeErrorCard("Nope", "Reason")));
```

Never construct `{ embeds: [...] }`, never use `content` for user-facing output,
and never pass `ephemeral: true` directly. Use `ephemeralCard`.

## Components

- `createActionButton`, `createBackButton`, `createPaginationRow`
- `createStringSelectMenu`, `createUserSelectMenu`, `createRoleSelectMenu`,
  `createChannelSelectMenu`, `createCategorySubmenuRow`
- `tabRow`, `settingRow`, `confirmRow`, `navRow`, `backRow`, `row`
- `buildSafeActionRows` enforces five rows and five components per row
- `pageFooter`, `formatStatusBadge`, `formatSubtitle`, `formatBreadcrumbs`,
  `formatPageFooter`, `componentEmoji`
- `BrandColors`, `resolveCardColor`

## Rules

- Every panel is navigable in place: buttons and selects edit the same message.
- Only the invoking user may operate a panel.
- Ephemeral is for errors and private data, not a default.
- Keep action rows at five or fewer and components per row at five or fewer.
- Section accessories hold one button each; use a row for multiple actions.
- New code has no comments.
