# UI

Package: `@lumi/ui` (`packages/ui`). Components V2 card builders copied from the
existing visual language. Keep the output identical unless the task explicitly
asks for a redesign.

- `makeInfoCard`, `makeSuccessCard`, `makeWarningCard`, `makeErrorCard`
- `makeListCard`, `makeEmptyCard`
- `ephemeralCard`, `noPingCard`
- `row`, `settingRow`, `tabRow`, `createPaginationRow`
- `createActionButton`, `createBackButton`, select-menu builders
- `formatStatusBadge`, `formatSubtitle`, `formatBreadcrumbs`, `formatPageFooter`
- `BrandColors`, `resolveCardColor`

Rules:

- Commands must use cards, never `EmbedBuilder`.
- Use `ctx.replySuccess` / `ctx.replyError` / `ctx.replyInfo` for standard replies.
- Use `makeListCard` for short lists; it caps at 25 visible items.
- Keep `allowedMentions: { parse: [] }` unless a mention is the point of the reply.
- Ephemeral is a deliberate choice for errors and private data, not a default.
- Discord allows at most five action rows and five components per row. Paginate
  or move controls into section accessories before adding a sixth row.
- Section accessories hold one button each; use a row when a section needs two
  actions.
