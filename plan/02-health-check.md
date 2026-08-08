# Phase 2 — Health Check page (self-contained, no schema changes)

**Goal:** A read-only scored checklist, computed entirely from data the dashboard already fetches for the guild overview — no new backend endpoint, no Prisma changes.

## Files

- `apps/dashboard/src/app/guild/[guildId]/health/page.tsx` — server component, calls the existing `getGuildDashboard` (already used by `layout.tsx`) plus whatever role/permission data `overview/page.tsx` currently reads.
- `apps/dashboard/src/components/guild/health-check-list.tsx` — new presentational component. Checks to compute client-side from existing data (mirroring what Wick's `sweep` endpoint does, per the audit):
  - Lumi's bot role position relative to other roles (already available from guild roles fetch).
  - Any non-bot role holding native Kick/Ban/Administrator (dangerous permissions) — flag by name.
  - `security.joingate_enabled`, `security.verification_enabled`, `security.antinuke_enabled` (already-existing config fields from `packages/core/src/modules/security/index.ts`) — flag if off.
  - `filter` module heat/spam settings present but disabled.
- Check first whether a `Card`-like primitive already exists under `apps/dashboard/src/components/ui/` before introducing new markup — reuse if present, otherwise the check-row visual (icon chip + text + optional "Fix" link to the relevant settings page) should match `alert.tsx`'s severity-color conventions (`--success`/`--warning` tokens), not introduce new colors.
- Add `Health Check` to the groups from Phase 1, under **Security**.
