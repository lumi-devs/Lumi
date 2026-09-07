# UI Components

Grounded in `packages/core/src/lib/utilities/cards.ts`, `commands.ts`/`command-context.ts`,
`packages/core/src/lib/utilities/panels.ts` + `ui/kit.ts`, and
`packages/core/src/lib/downloader/validate.ts`.

## Why raw `new EmbedBuilder()` is banned

Two gates, one per surface:

- **First-party (`packages/core/src`)**: root `eslint.config.mjs:23-46` has a
  `no-restricted-imports` rule blocking `EmbedBuilder` from `discord.js` /
  `@discordjs/builders` repo-wide, plus `62-79` banning raw `interaction.reply` /
  `MessageFlags.Ephemeral` in `commands/*.ts` (must go through `ctx.reply*`), plus
  `82-96` blocking sibling-module imports. `packages/eslint-config` itself carries
  no `EmbedBuilder` reference — the rule lives in the root config.
- **Third-party addons**: the addon validator in
  `packages/core/src/lib/downloader/validate.ts` regex-scans every module file at
  install/update time:

```ts
// validate.ts:97
const EmbedImportRe = /import\s*(?:type\s*)?\{[^}]*\bEmbedBuilder\b[^}]*\}\s*from\s*["'](?:discord\.js|@discordjs\/builders)["']/;

// validate.ts:326-329
if (EmbedImportRe.test(src) || /\bnew\s+EmbedBuilder\s*\(/.test(src))
  errors.push(
    `${rel}: uses EmbedBuilder - user-facing replies must use the make*Card helpers from "lumi".`,
  );
```

For first-party code the lint rule is the gate and it holds: grepping the whole `packages/core/src` tree for `EmbedBuilder` turns
up zero usages outside this validator's own regex strings. Every card in the codebase goes
through `#utilities/cards.js`, which is itself built entirely on Components V2 primitives, not
`EmbedBuilder`. `CardReply.components` is typed as `readonly ContainerBuilder[]`
(`utilities/ui/types.ts`), not `any[]` — a V2 message has no `embeds` field at all.

## Components V2 in this codebase

This is not aspirational — `cards.ts` imports directly from `@discordjs/builders`:

```ts
// cards.ts:1-11
import {
  ActionRowBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
```

Every card is a `ContainerBuilder` (`buildContainer`, `cards.ts:50-155`) populated with
`TextDisplayBuilder` (markdown text blocks), `SectionBuilder` (a text block + one accessory —
button or thumbnail), `MediaGalleryBuilder`/`MediaGalleryItemBuilder` (header image strips),
and separators (`c.addSeparatorComponents(...)`). The reply payload sets
`flags: MessageFlags.IsComponentsV2` (`cards.ts:157-161`, the `wrap` function) — that flag is
what tells Discord to render `components` as the actual message body instead of attachments to
a classic `content`/`embeds` message; a V2 message has no `embeds` field at all. `ephemeralCard`
(`cards.ts:40-43`) ORs in `MessageFlags.Ephemeral` alongside it.

## Card builders (`#utilities/cards.js`)

```ts
makeSuccessCard(title: string, body: string | string[], opts?: CardOptions): CardReply
makeErrorCard  (title: string, body: string | string[], opts?: CardOptions): CardReply
makeWarningCard(title: string, body: string | string[], opts?: CardOptions): CardReply
makeInfoCard   (title: string, body: string | string[], opts?: CardOptions): CardReply
makeCard(color: number | undefined, title, body, opts?): CardReply   // shared primitive
makeListCard(title: string, items: string[], opts?: CardOptions): CardReply
makeEmptyCard(title: string, reason: string, suggestion?: string, opts?: CardOptions): CardReply
```

All four `make*Card` variants (`cards.ts:163-185`) are one-liners over `makeCard`, differing
only in which `resolveCardColor("success"|"error"|"warning"|"info")` accent they pass.
`CardReply` (`ui/types.ts:3-7`) is just `{ flags?, components: any[], allowedMentions? }` — the
literal `InteractionReplyOptions`-compatible shape.

`CardOptions` (`cards.ts:23-38`) covers everything a card can carry: `subtitle`,
`breadcrumbs` (rendered via `formatBreadcrumbs`), `statusBadge`, `footer`, `thumbnail`/
`thumbnailUrl`, `sections` (an array of pre-built `SectionBuilder`s — this is how panels
compose `settingRow`/`thumbRow` results into a card), `actionRows`, and `headerImages` (up to
10 URLs rendered as a `MediaGalleryBuilder` banner). `makeListCard` builds its body via
`fitLines` (`cards.ts:205-226`), which packs list items into one `TextDisplay` and truncates
with a `"-# ...and N more item(s)."` notice when the 4000-char `TextDisplayLimit` would
otherwise be exceeded by `@discordjs/builders`' client-side validation.

## Reply helpers

Two layers exist, both funneling into the card builders — never construct a reply payload by
hand.

`#lib/commands.js` exports free functions built for raw interaction handlers:
`replySuccess`/`replyError`/`replyWarning`/`replyInfo` (`commands.ts:75-78`), each a
`makeReplyHelper(factory)` wrapper (`commands.ts:60-73`) that wraps the card in
`ephemeralCard(...)` unless `{ ephemeral: false }` is passed, then calls `sendReply`
(`commands.ts:51-56`, which calls `sendInteractionReply(interaction, payload, "followUp")`).

Inside a `CommandContext`-based command (the normal path — see `BaseCommand`/`BaseSubcommand`
in `commands.ts:409-511`), the equivalent methods live directly on `ctx`:
`ctx.replySuccess/replyError/replyWarning/replyInfo/replyEmpty`
(`command-context.ts:318-357`), all thin wrappers over `ctx.reply(card, opts)`
(`command-context.ts:301-316`). `ctx.reply` is what actually branches on transport: on the
slash path it ephemeral-wraps (unless opted out) and calls `sendInteractionReply(...,
"edit")`; on the prefix path it sends a plain reply the first time and *edits* that same
message on subsequent calls in the same command run (`#lastPrefixReply`,
`command-context.ts:310-315`) — so a multi-step progress card (defer → progress → final result)
doesn't spam three separate messages in a text channel.

## Panel kit (`#utilities/panels.js` + `ui/kit.ts`)

`panels.ts` re-exports the actual row builders from `ui/kit.ts` (`panels.ts:22-38`) plus its
own select-menu/button constructors (`createStringSelectMenu`, `createChannelSelectMenu`,
`createPaginationRow`, `buildSafeActionRows`, ...). The core builders panels are built from:

- **`settingRow(lines, button)`** (`ui/kit.ts:60-69`) → `SectionBuilder` — up to 3 text lines
  plus one inline accessory button. This is the list-row primitive: label + current value +
  an Edit/Toggle button. Used for every "one config field, one row" panel line.
- **`thumbRow(lines, imageUrl)`** (`ui/kit.ts:72-83`) → `SectionBuilder` with a thumbnail
  accessory instead of a button, same 3-line cap.
- **`tabRow(prefix, tabs, activeId)`** (`ui/kit.ts:104-121`) → `ActionRowBuilder<ButtonBuilder>`
  — up to 5 tabs, active one rendered as a disabled `Primary` button, the rest `Secondary`,
  customId `${prefix}:${tab.id}`.
- **`confirmRow(options)`** (`ui/kit.ts:132-145`) → Danger confirm + Secondary cancel pair, for
  destructive-action gates.
- **`backRow(customId, label?)`** (`ui/kit.ts:148-158`) → single Secondary back button, for
  subpanel footers.
- **`navRow(options)`** (`ui/kit.ts:164-188`) → back button + one primary action, for detail
  views that need both.
- **`createPaginationRow(options)`** (`panels.ts:222-255`) → Prev/indicator/Next button trio
  with automatic first/last-page disabling.

Real usage, `packages/core/src/modules/core/ui/hub.ts` — `buildSettingsView`
(`hub.ts:120-195`) composes a `settingRow` into `CardOptions.sections`, a select menu built
with `createStringSelectMenu`, and three action rows (`langSelect`, `maintenanceButtons`,
`hubTabRow(...)` which itself calls `tabRow("lumi:tab", hubTabs(t), active)`,
`hub.ts:54-56`) — passed straight to `makeCard(..., { sections, actionRows, ... })`. That's the
complete pattern: build `SectionBuilder`s/`ActionRowBuilder`s with the panel kit, hand them to
a `make*Card` call, never touch `ContainerBuilder` directly from a command/module file (only
`cards.ts` itself does).

`buildSafeActionRows` (`panels.ts:257-280`) is a defensive clamp — Discord caps a message at 5
action rows of 5 components each; any panel building rows dynamically (e.g. per-item toggle
buttons) should pass its assembled row list through this before handing it to `actionRows` so
an over-long dynamic list truncates with a `container.logger.warn` instead of the whole
interaction failing to send.
