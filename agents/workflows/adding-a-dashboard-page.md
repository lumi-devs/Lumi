# Adding a page to the dashboard

Worked example: `apps/dashboard/src/app/guild/[guildId]/moderation/notes/page.tsx`
(the mod-notes page) — a real, complete guild-scoped page: auth guard, one RPC
read, a client-side filter, a table component, an export action. Background:
`agents/architecture/rpc-bridge.md` for the read/mutation split this all rests on.

## 1. Where the file goes

`apps/dashboard/src/app/` is Next.js App Router. Every guild-scoped page lives
under `apps/dashboard/src/app/guild/[guildId]/<path>/page.tsx`. Nesting mirrors
the URL exactly — `moderation/notes/page.tsx` is `/guild/[guildId]/moderation/notes`.
There's also a non-guild-scoped `system/` tree (bot-owner-only pages —
`system/shards`, `system/modules`, `system/blocklist`, `system/users`,
`system/audit`, `system/addons`) which uses `requireBotOwner()` instead of
`requireGuild()` (step 2) but is otherwise the same shape.

`apps/dashboard/src/app/guild/[guildId]/layout.tsx` wraps every page under that
segment — it already calls `requireGuild(guildId)` once and renders the side
nav/header, so an individual page doesn't need to redo the guild-picker/invite
flow. It does still need its own `requireGuild` call (see step 2) since a
layout only guards the *render*, not any Server Action a page's own components
might call.

## 2. Auth check inside the page itself

Every real guild page re-derives the session and re-checks authorization,
even though the layout already did it once — defense in depth for
guild-scoped routes:

```ts
import { requireGuild } from "#/lib/auth-guards";

export default async function ModNotesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  // ...
}
```

`requireGuild` (`apps/dashboard/src/lib/auth-guards.ts:20-24`) 404s (not 403s)
if the session's guild list doesn't include this guild with manage
permissions — `notFound()` rather than `redirect()`, deliberately, so an
unauthorized caller can't distinguish "guild exists but you can't manage it"
from "guild doesn't exist." Never skip this even though the layout already
ran it once — a Server Action reached from this page's own components will
call `requireGuild` again independently, and the page itself needs `session.userId`
regardless for the RPC calls it makes.

Both `params` and (if the page reads query params) `searchParams` are
`Promise`s in this Next.js version — `await` them before destructuring, not
directly destructured from props.

## 3. Fetching data — always through `dashboard-fetch.ts`, never direct

```ts
import { getGuildDashboard, getGuildModNotes } from "#/lib/dashboard-fetch";

const dashboard = await getGuildDashboard(guildId, session.userId);
// conditionally, based on a query param:
const notes = await getGuildModNotes(guildId, session.userId, userId);
```

If the function you need doesn't exist yet in `dashboard-fetch.ts`, that's a
new RPC action — see `agents/workflows/adding-an-rpc-action.md`, "Reads" section
— not something to work around with a fetch call to a REST endpoint the worker
doesn't have. The dashboard never opens a direct Postgres/Redis connection;
`dashboard-fetch.ts` (and `apps/dashboard/src/actions/*` for mutations) is the
entire data-access surface.

Wrap a fetch in a `try`/`catch` and degrade gracefully rather than letting an
RPC failure crash the whole page, if the page has a sensible empty/error state
to fall back to — the notes page does exactly this (`page.tsx:46-52`) so an
`8000ms` RPC timeout or a worker hiccup renders an `EmptyState` with the
failure message instead of a Next.js error boundary. The guild layout itself
does the same thing at a coarser grain (`layout.tsx:20-30`) — if
`getGuildDashboard` itself fails, it renders `InviteNeeded` instead of the
whole nav shell.

## 4. Composing the page

Real components used by the notes page, all from
`apps/dashboard/src/components/ui/*` and `apps/dashboard/src/components/guild/*`:
`PageHeader` (title + description banner), `Card`/`CardHeader`/`CardTitle`/
`CardDescription`, `FilterBar` (the search-by-field control, driven by
`searchParams` so filters are URL-shareable and server-rendered rather than
client state), `EmptyState` (no-data / error placeholders, `compact` variant
for inline-in-card use), `Badge`, `ExportLogButton` (wraps a Server Action for
a downloadable JSON export). Reach for these before building a new one-off
component — check `apps/dashboard/src/components/ui/` first.

The actual data table (`GuildModNotesTable`) is its own component under
`apps/dashboard/src/components/guild/`, receiving plain serializable props
(`guildId`, `userId`, `notes`, `memberNames`) — it's a Client Component (any
interactive table with row actions needs to be, to call Server Actions on
click), while `page.tsx` itself stays a Server Component. Keep the split at
that boundary: the page fetches and passes data down, the interactive pieces
that need `"use client"` live in `components/guild/`.

## 5. Wiring mutations from the page's own client components

The table component calls Server Actions directly (e.g. `removeModNote` from
`apps/dashboard/src/actions/mod-notes-actions.ts`), not the page. If your new
page needs a mutation and no action exists yet for it, add it per
`agents/workflows/adding-an-rpc-action.md`'s mutation-caller step — one
`"use server"` file under `apps/dashboard/src/actions/`, wrapped in
`runAction`, calling `revalidatePath` with this page's own route on success so
the page reflects the change without a manual refresh.

## 6. Hooking into the sidebar

`apps/dashboard/src/lib/guild-nav.ts` is the single source both the rendered
sidebar (`GuildSideNav`) and the command palette (`CommandPalette`) read from
— a link added here reaches both automatically, nothing else to wire. Add an
entry to the right `GuildNavGroup` in `guildManagementGroups(guildId)`:

```ts
{
  title: "Discipline & Appeals",
  links: [
    // ...
    { href: `${base}/moderation/notes`, label: "Mod Notes", icon: StickyNote },
  ],
},
```

Pick an existing group by topic (`"Discipline & Appeals"`, `"Safety & Security"`,
`"Community & Engagement"`, `"Monitoring & Diagnostics"`, `"Configuration"` are
the five that exist) rather than inventing a new one for a single page — and
pick a `lucide-react` icon not already used elsewhere in the list for visual
distinctness. If the page is one of the three always-visible top links instead
of a collapsible group item (this is rare — only Overview/Configuration/Guided
Setup are top-level), it goes in `guildTopLinks` instead.

## 7. Tests

Component-level tests live in `apps/dashboard/tests/components/*.test.tsx`
(`@vitest-environment jsdom` at the top of the file, `render`/`screen` from
React Testing Library, query by role/name). Not every page has a dedicated
page-level test — the notes page itself doesn't — but its interactive table
component is the natural test target if you're adding one:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const someAction = vi.fn();
vi.mock("#/actions/mod-notes-actions", () => ({ addModNote: someAction, removeModNote: someAction }));

const { GuildModNotesTable } = await import("#/components/guild/guild-mod-notes-table");

describe("GuildModNotesTable", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders one row per note", () => { /* ... */ });
});
```

Mock the Server Action module the component calls (`vi.mock("#/actions/...")`)
rather than letting it actually call `rpcCall` — these are unit tests of
rendering/interaction logic, not integration tests of the RPC bridge. If the
page itself has meaningful server-side branching worth testing (like
`page.test.tsx` does for the root landing/guild-picker split), mock
`#/lib/auth`/`#/lib/dashboard-fetch` the same way and `await import()` the page
module after the mocks are registered, then `render(await PageComponent())`
since these are `async` Server Components.

Plain TS logic (helpers, formatters used by the page) go in
`apps/dashboard/tests/lib/*.test.ts` instead — mirrors `src/lib`.
