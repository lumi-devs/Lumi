---
"@lumi/core": patch
---

Serialize `ModuleStore.setEnabled()` and `ModuleStore.reload()` per module name so overlapping calls (e.g. a rapid double-toggle from the dashboard) can no longer interleave and leave a module's enabled state or loaded instance inconsistent.
