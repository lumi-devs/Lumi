---
"@lumi/core": patch
---

Serialize addon repo git operations per repo name so a manual "update repo" click can no longer race the scheduled auto-update task's own `git pull` on the same checkout directory.
