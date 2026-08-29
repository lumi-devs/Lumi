---
"@lumi/core": minor
"@lumi/dashboard": minor
"@lumi/docs": minor
---

**Brand & Theme System**:
- Established the single-source-of-truth "Midnight Sapphire" brand system in `BrandColors` and `BrandTokens` (`#4C6EF5` primary sapphire accent, with emerald `#12B886` success, amber `#F59F00` warning, rose `#FA5252` error).
- Aligned bot card utilities (`makeInfoCard`, `makeSuccessCard`, etc.) and `apps/dashboard/src/app/globals.css` dark and light mode tokens with the Midnight Sapphire system.
- Added `ctx.brandColor()` helper to `CommandContext` for resolving per-guild theme colors.

**GDPR & Security**:
- Implemented `data-retention-sweep` daily scheduled task in core module for automated retention cleanup of stale audit ledger records and expired moderation cases.
- Enforced mandatory `end_user_data_statement` on addon manifests (`info.json`) with clear validator diagnostics.
- Upgraded dashboard rate limiting to `RateLimiterRedis` with graceful in-memory fallback for horizontal replica coordination.
- Added client-side GDPR cookie consent banner on the dashboard.

**Next.js 16 Documentation Site**:
- Migrated `apps/docs` from Astro to Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Motion (`motion/react`).
- Features animated landing hero, 4-quadrant feature Bento Grid, live Discord Card Preview simulator, macOS traffic-light code blocks, sticky table-of-contents scrollspy, command palette modal, and static export build support for GitHub Pages / CDN deployments.
