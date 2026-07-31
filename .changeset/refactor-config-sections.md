---
"@lumi/core": minor
"@lumi/contracts": minor
---

Group config fields into navigable subsections in the `/lumi` config panel.
Modules with many settings (security, filter, logging) no longer render as a
flat, multi-page scroll of every field; a `group` on each config field collects
related settings into a section, and the detail view shows one section at a time
with a "jump to section" select. Small modules are unchanged. Large ungrouped
modules fall back to automatic paging so the component budget is never exceeded.
