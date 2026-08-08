# Verification (all phases)

- `pnpm --filter dashboard dev` and click through the new grouped sidebar — confirm: groups collapse/expand smoothly, active-pill still slides correctly when navigating between items in different groups, collapsed state survives a page navigation (localStorage).
- `pnpm --filter dashboard build` (or repo-root `pnpm build` via Turborepo) to catch type errors from the `GuildNavLink[]` → `GuildNavGroup[]` signature change — `guild-sidebar.tsx` and the `CommandPalette` mentioned in `guild-nav.ts`'s own comment ("Shared by `GuildSidebar` (rendered) and `CommandPalette` (searched); a link added here must reach both") both consume this data, so the `CommandPalette` call site needs updating too — grep for `guildManagementLinks` usage before renaming to confirm every caller is caught.
- For Phase 2: manually toggle `security.joingate_enabled` off on a test guild and confirm the Health Check page reflects it without a page reload lag longer than the existing revalidation pattern.
- For Phases 3-4: `pnpm db:push`, then exercise the new RPC action from the dashboard UI end-to-end against a real worker/core process, not just type-check the action file.
