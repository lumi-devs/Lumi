# ⚠ Open question — visual direction unresolved, paused here

The nav-structure plan (Phase 1-4) was drafted against Lumi's *existing* restrained, near-black Linear-style system (`apps/dashboard/src/app/globals.css`). Mid-review, the direction was challenged: wants something more colorful, bigger, bolder — explicit references were Sapphire (`sapph.xyz`, dashboard at `dashboard.sapph.xyz`) and Dyno (`dyno.gg`) as "proper SaaS website" inspiration, i.e. a marketing-site register, not a restrained ops-console one.

## Not yet resolved before this was paused

- Only got text search summaries for Sapphire/Dyno, not actual screenshots/HTML of their current dashboards — a real visual review (screenshots or HAR, same method as the Wick audit) is needed before proposing a new palette/type direction, not just a description.
- Whether "colorful/bigger/SaaS" means the **marketing site** (`wickbot.com`-style landing page) or the **authenticated dashboard itself** — those are different design problems; Dyno/Sapphire's marketing pages are bold/colorful but their actual dashboards (like most ops tools) tend to be calmer. Worth confirming which surface is in scope before redesigning tokens.
- If the dashboard itself moves toward bold/colorful, that's a `globals.css` token-level change (new palette, bigger type scale) affecting every page, not just the nav — much bigger blast radius than Phase 1. Should probably be scoped as its own Phase 0 / design-system pass, decided *before* Phase 1's nav work so the nav isn't rebuilt twice.

## Status

Stopped here at user request. Resume by screenshotting Sapphire + Dyno (both marketing site and dashboard separately), then deciding scope (landing page vs. dashboard vs. both) before touching any token values.
