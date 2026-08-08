---
"@lumi/dashboard": patch
---

Restyles the dropdown menu component to use the dashboard's own design tokens instead of generic shadcn defaults, and fixes the temp-VC generator form: the name-pattern placeholder legend moves into an info tooltip with a live preview chip (fixing a row-alignment bug caused by long wrapping hint text), and the "Creates" column no longer shows two identical preview names when the pattern has no numbering placeholder.
