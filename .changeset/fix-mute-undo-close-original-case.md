---
"@lumi/core": patch
---

`/untimeout` and `/vcunmute` now close out the case(s) they supersede and cancel that case's scheduled auto-lift job, instead of leaving the original case active so its lift job redundantly re-lifts an already-lifted mute later.
