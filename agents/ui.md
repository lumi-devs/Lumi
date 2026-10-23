# UI

Package: `@lumi/ui` (`packages/ui`). Components V2 card builders copied from the
existing visual language. Keep the output identical unless the task explicitly
asks for a redesign.

- `makeInfoCard`, `makeSuccessCard`, `makeWarningCard`, `makeErrorCard`
- `makeListCard`, `makeEmptyCard`
- `ephemeralCard`, `noPingCard`
- `formatStatusBadge`, `formatSubtitle`, `formatBreadcrumbs`, `formatPageFooter`
- `BrandColors`, `resolveCardColor`

Rules:

- Commands must use cards, never `EmbedBuilder`.
- Use `ctx.replySuccess` / `ctx.replyError` / `ctx.replyInfo` for standard replies.
- Use `makeListCard` for short lists; it caps at 25 visible items.
- Keep `allowedMentions: { parse: [] }` unless a mention is the point of the reply.
- Ephemeral is a deliberate choice for errors and private data, not a default.
