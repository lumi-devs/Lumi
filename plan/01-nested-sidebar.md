# Phase 1 — Grouped sidebar with spring active-pill (do this first)

**Goal:** Replace the flat `guildManagementLinks()` list with four collapsible groups, using the spring `layoutId` pattern already established in the codebase — no new animation system needed.

## Key existing pattern to reuse, not reinvent

`apps/dashboard/src/components/layout/theme-toggle.tsx:40-44` and `apps/dashboard/src/components/ui/switch.tsx` already do exactly this:

```tsx
<motion.span
  layoutId="theme-toggle-pill"
  className="absolute inset-0 rounded-full bg-surface"
  transition={{ type: "spring", stiffness: 500, damping: 40 }}
/>
```

`nav-item.tsx:40-44` already applies this same pattern per-item with `layoutId="nav-active-pill"`. Because only one item is ever `active` (driven by `usePathname`), this **already works correctly across groups with zero changes** — Motion's shared `layoutId` doesn't care about DOM nesting depth. No hand-rolled spring/JS engine is needed here (unlike the throwaway HTML prototype, which had no access to the real `motion` library).

## Files

- `apps/dashboard/src/lib/guild-nav.ts` — replace `guildManagementLinks(guildId): GuildNavLink[]` with `guildManagementGroups(guildId): GuildNavGroup[]`, where `GuildNavGroup = { title: string; links: GuildNavLink[] }`. Groups and membership (mapping today's 10 links plus 3 new ones from Phases 2-4):
  - **Moderation**: Moderation Cases, Warn Thresholds, Mod Notes *(Phase 3)*, Blocklist
  - **Security**: Panic & Verification, Overrides, Health Check *(Phase 2)*
  - **Community**: Voice Generators, Permits, Appeals *(Phase 4)*
  - **System**: Settings History, Audit Log, Advanced
- `apps/dashboard/src/components/layout/nav-item.tsx` — add a new exported `NavGroup` component alongside the existing `NavItem`/`NavSection`:
  - Local `open` state (`useState`), default `true` (nothing hides on first load — collapsing is an option, not a default state that hides functionality).
  - Header row: chevron (reuse `ChevronRight` from `lucide-react`, same icon already used in `module-toggle-grid.tsx:4,103` for expand affordance) rotated 90° when open via `motion.svg` `animate={{ rotate: open ? 90 : 0 }}`; group title styled like the existing `NavSection` title (`text-[11px] font-semibold tracking-[0.11em] uppercase text-fg-subtle`).
  - Body: wrap children in `<motion.div animate={{ height: open ? "auto" : 0 }} className="overflow-hidden">` — Motion supports animating to `"auto"` natively, no CSS grid-rows trick required.
  - Persist collapsed state per guild in `localStorage` (small `useCollapsedGroups(guildId)` hook colocated in the same file) so a user's preference survives navigation — default open if unset.
- `apps/dashboard/src/components/layout/guild-sidebar.tsx` — swap the single `<NavSection title="Management">` block for `guildManagementGroups(guildId).map(g => <NavGroup key={g.title} title={g.title} ...>)`.

## Not in scope

The cursor-following magnetic glow and card-tilt from the prototype — those were prototype flourishes to demonstrate motion range, not something to port; they'd fight the app's existing restraint ("one quiet glow," per the `globals.css` comment block). Skip them.
