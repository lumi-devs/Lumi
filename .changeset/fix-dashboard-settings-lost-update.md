---
"@lumi/dashboard": patch
---

`GeneralSettingsForm` now sends only the fields the user actually changed instead of the full form state, so a stale/prefetched baseline can no longer silently revert unrelated settings on save. The save-bar's Cmd/Ctrl+S shortcut also now respects an in-flight save.
