# Nested Guild Sidebar Nav + New Pages from the Wick Audit

Source: competitive teardown against Wick's dashboard (docs + HAR + screenshots). Split into phases so each can ship and be reviewed independently. Land in order — Phase 1 is what makes Phases 2-4 reachable in the nav at all.

- [`00-open-question.md`](./00-open-question.md) — **resolved**, see [`00-shadcn-migration.md`](./00-shadcn-migration.md).
- [`00-shadcn-migration.md`](./00-shadcn-migration.md) — full migration of `apps/dashboard`'s component layer to shadcn/ui (real Radix primitives), keeping Lumi's existing palette/values. Resolves the open question below. **Land before/alongside Phase 1's component-layer work** — Phase 1's data layer (`guildManagementGroups`) stays, but its `NavGroup` component gets swapped for shadcn's `Sidebar` in sub-phase 0c.
- [`01-nested-sidebar.md`](./01-nested-sidebar.md) — grouped sidebar nav, spring active-pill (reuses existing `motion` patterns already in the codebase). Data layer (`guildManagementGroups`) already implemented; component layer superseded by `00-shadcn-migration.md` sub-phase 0c.
- [`02-health-check.md`](./02-health-check.md) — read-only scored checklist page, no schema changes.
- [`03-mod-notes.md`](./03-mod-notes.md) — persistent staff notes per member (schema + repo + permit + bot command).
- [`04-appeals.md`](./04-appeals.md) — ban/timeout appeal pipeline (schema + repo + permit + public intake route).
- [`05-verification.md`](./05-verification.md) — how to test each phase end-to-end.
- [`06-competitor-research.md`](./06-competitor-research.md) — background research (not a phase to land): Wick/Red-DiscordBot/Skyra feature comparison, plus Sapphire/Dyno dashboard visual notes feeding the paused visual-direction decision above.

## Context

A competitive teardown against Wick's dashboard (docs + HAR + screenshots) surfaced a real gap: Lumi's guild sidebar is one flat 10-item "Management" list, where Wick groups related settings into collapsible categories (Auto Mod / Anti Nuke / Server Joins). An interactive prototype was built and approved directionally — spring-physics active-pill, collapsible groups — built entirely on Lumi's *existing* design tokens (`globals.css`) and motion conventions, not a new visual identity.

This plan turns that prototype into real code, plus the three genuinely-missing features the same audit identified (Health Check, Mod Notes, Appeals) that the new nav groups need somewhere to point to.
