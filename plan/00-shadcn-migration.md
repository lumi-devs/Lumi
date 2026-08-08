# Phase 0 — Full migration to shadcn/ui (supersedes 00-open-question.md)

**Resolution of the open question:** reviewed `satnaing/shadcn-admin`, `dubinc/dub`, and `calcom/cal.com` as references. All three converge on shadcn/ui's neutral OKLCH palette and CVA-based component conventions — the same register Lumi's `apps/dashboard/src/components/ui/*` already speaks (`class-variance-authority` + `cn()` are already in use). Decision: **fully migrate to shadcn/ui** — real Radix-backed primitives, not hand-rolled equivalents — while keeping Lumi's existing token *values* (the near-black restrained palette), remapped into shadcn's CSS variable naming (`--background`, `--sidebar`, etc. in `globals.css`). Do not adopt Dub's two-tier icon-rail — that's an IA for multi-product SaaS; Lumi is a single-product dashboard, so a single grouped rail (shadcn's standard `Sidebar` + `SidebarGroup`/`Collapsible`) is the right shape, same conclusion Phase 1 already reached independently.

**Goal:** Every primitive under `apps/dashboard/src/components/ui/` becomes a real shadcn/ui component (installed via `shadcn` CLI where possible, hand-ported where the CLI can't target this repo's structure), and every consumer across the dashboard is migrated to it. No parallel design system left behind.

## Sub-phases (land in order, each independently verifiable via typecheck/tests)

### 0a — Install & configure
- Add `components.json` (Next.js, Tailwind v4, `src/` structure, existing `#/` import alias — check `tsconfig.json` paths first).
- Remap `apps/dashboard/src/app/globals.css` tokens into shadcn's expected CSS variable names (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar*`) using Lumi's *current* color values (near-black, existing accent) — do not adopt shadcn-admin's default gray values, only its variable naming/structure.
- Install needed Radix packages as components are added (CLI handles this per-component).

### 0b — Core primitive migration
Replace each existing hand-rolled primitive with its shadcn equivalent, preserving (or deliberately updating, noted per-component) the existing export name and prop surface so consumer churn is mechanical, not a redesign-per-callsite:
`button`, `input`, `badge`, `card`, `switch`, `alert`, `table`, `separator`, `tooltip`, `dropdown-menu`, `dialog`, `sheet`, `skeleton`, `avatar`. Keep `glyph.tsx`, `empty-state.tsx`, `page-header.tsx` as Lumi-specific compositions built on top of the new primitives (shadcn has no direct equivalent).
Grep every consumer of the replaced components across `apps/dashboard/src` and update call sites to the new API where it changed.

### 0c — Sidebar
Replace Phase 1's hand-rolled `NavGroup`/`NavItem` (in `layout/nav-item.tsx`) with shadcn's `Sidebar` primitive (`SidebarProvider`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuButton`, `Collapsible`), reusing the `guildManagementGroups()` data shape from `guild-nav.ts` already built in Phase 1 — this is a component-layer swap, not a data-layer one. Preserve: active-route highlighting, per-guild collapsed-group persistence (shadcn's `Sidebar` supports icon-collapse mode via cookie; Lumi's existing localStorage-per-guild approach for group-open/closed state layers on top). Update `guild-sidebar.tsx` and `command-palette.tsx` accordingly.

### 0d — DataTable
Add shadcn's `DataTable` pattern (`@tanstack/react-table` + the `columns`/`data-table.tsx` convention) and retrofit existing table-heavy pages (`guild-blocklist-table.tsx`, `moderation-cases-table.tsx`, and any others under `components/guild/`, `components/system/`) to it. New tables in Phase 3 (Mod Notes) and Phase 4 (Appeals) should be built directly on this pattern rather than one-off markup.

## Verification
`bun run typecheck` and the dashboard test suite after each sub-phase — `next build` is known to segfault in this sandbox (pre-existing Bun/Turbopack issue, confirmed unrelated to any of this work), so typecheck+tests are the reliable signal. Manually spot-check the running dev server (`bun run dev`) for visual regressions on at least: guild sidebar, one form page (general settings), one table page (moderation cases), system layout.
