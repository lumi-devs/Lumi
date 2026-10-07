---
"@lumi/core": patch
---

Log a warning when a component interaction matches no handler. Unmatched button/select clicks previously failed with "did not respond in time" and left no trace in the logs; the dispatch watchdog now records the customId, user, and guild.
