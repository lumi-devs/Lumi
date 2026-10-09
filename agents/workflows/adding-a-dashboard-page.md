# Adding a page to the dashboard

> The dashboard lives in its own repository: [`lumi-devs/lumi-dashboard`](https://github.com/lumi-devs/lumi-dashboard).
> Dashboard files below (`src/...`) are relative to that repository's root.
> Only the backend RPC-side steps (contract slice, `implementRpc()`, `registry.ts`) happen here in Lumi.

Worked example: `src/app/guild/[guildId]/moderation/notes/page.tsx`
(the mod-notes page) — a real, complete guild-scoped page: auth guard, application
use case, client-side filter, a table component, and an export action.
Background: `agents/architecture/rpc-bridge.md` for the read/mutation split this all rests on.

---

## 1. Where the file goes

`src/app/` is Next.js App Router. Every guild-scoped page lives
under `src/app/guild/[guildId]/<path>/page.tsx`. Nesting mirrors
the URL exactly — `moderation/notes/page.tsx` is `/guild/[guildId]/moderation/notes`.

Non-guild system pages live under `src/app/system/` (bot-owner only —
`system/shards`, `system/modules`, `system/blocklist`, `system/users`,
`system/audit`, `system/addons`) and use `requireBotOwner()` instead of
`authorizedGuild()`.

---

## 2. Server Page Structure

A guild page performs authentication and passes data to domain module components:

```tsx
import { authorizedGuild } from "#/lib/auth-guards";
import { getGuildOverview } from "#/application";
import { ModuleBoundary } from "#/components/layout/ModuleBoundary";
import { GuildModNotesTable } from "#/modules/moderation";

export default async function ModNotesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await authorizedGuild(guildId);

  const overview = await getGuildOverview(guildId, session.userId);

  return (
    <ModuleBoundary moduleId="moderation" capability="moderation.view">
      <GuildModNotesTable guildId={guildId} />
    </ModuleBoundary>
  );
}
```

---

## 3. Module Boundaries & Components

- Domain components live in `src/modules/<module-name>/components/`.
- All module components and definitions are exposed through `src/modules/<module-name>/index.ts`.
- Generic schema and form controls live in `src/components/config/`.
- Design system primitives live in `src/components/ui/`.
- Layout wrappers live in `src/components/layout/`.
