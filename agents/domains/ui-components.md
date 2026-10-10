# UI Components

Grounded in `packages/core/src/lib/ui/cards.ts`, `packages/core/src/lib/ui/panels.ts`,
`packages/core/src/lib/ui/layout.ts`, and `packages/core/src/lib/downloader/validate.ts`.

## Why raw `new EmbedBuilder()` is banned

Two gates, one per surface:

- **First-party**: root `eslint.config.mjs:51` blocks `EmbedBuilder` from
  `discord.js`/`@discordjs/builders` repo-wide, plus `commands/*.ts` rules
  banning raw `interaction.reply` and `MessageFlags.Ephemeral` ORed into a
  reply — everything goes through `ctx.reply*` and the card builders.
- **Third-party addons**: the validator regex-scans every file at install/update
  (`EmbedImportRe`, `validate.ts:105`; the `new EmbedBuilder(` check at `:469`).

Every reply goes through `@lumi/lib/ui/cards.js`, built entirely on Components V2
primitives — a V2 message has no `embeds` field at all.

## Components V2 in this codebase

`cards.ts` imports builders directly from `@discordjs/builders`. Every card is
a `ContainerBuilder` (`buildContainer`) of `TextDisplay` blocks, `Section`s
(text + one accessory), `MediaGallery` strips, and separators. The `wrap`
helper (`cards.ts:164`) sets `flags: MessageFlags.IsComponentsV2`;
`ephemeralCard` (`:41`) ORs in `Ephemeral`.

## Card builders (`@lumi/lib/ui/cards.js`)

`makeSuccessCard` / `makeErrorCard` / `makeWarningCard` / `makeInfoCard` /
`makeListCard` / `makeEmptyCard` are one-liners over `makeCard` (`:194`),
differing only in accent color (`resolveCardColor`, now in
`@lumi/lib/ui/palette.js`). `CardOptions` covers subtitle, breadcrumbs, status
badge, footer, thumbnail, pre-built `sections`, `actionRows`, and
`headerImages`. `makeListCard` packs via `fitLines`, which truncates with a
`"-# ...and N more item(s)."` notice before the 4000-char `TextDisplayLimit`
(`:201-203`) trips builders' client-side validation.

`ctx.replySuccess/replyError/...` wrap these; on slash they ephemeral-wrap,
on prefix they edit the last reply in place instead of spamming messages.

## Panel kit (`@lumi/lib/ui/panels.js`)

Row builders live directly in `panels.ts` (no separate kit module):
`settingRow` (label + value + button), `thumbRow`, `tabRow` (active tab
disabled Primary, rest Secondary, customId `<prefix>:<tab.id>`),
`confirmRow` (Danger + cancel), `backRow`, `navRow`, `createPaginationRow`,
plus `buildSafeActionRows` (clamps dynamic row lists to Discord's 5×5 cap with
a warn instead of a failed send).

Pattern (`modules/core/ui/hub.ts`): build `SectionBuilder`s/`ActionRowBuilder`s
with the kit, hand them to a `make*Card` call via `sections`/`actionRows`
(`settingRow(...)` at `hub.ts:120`, `hubTabRow("home", t)` at `:102`). Never
touch `ContainerBuilder` outside `cards.ts` itself.

## Addon surface (`lumi/ui`)

Addons get the pure subset only: card builders, `actionRow`/`selectRow`/`modal`
component builders, `Emojis`, colors. The host-backed runtimes
(`confirmPrompt`, `paginateList`, panel row builders needing live interactions)
are deliberately absent — an isolate has no live interaction objects; anything
interactive goes through host RPC (`ctx.*`, `lumi/discord`).
