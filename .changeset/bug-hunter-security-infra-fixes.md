---
"@lumi/core": patch
"@lumi/dashboard": patch
---

**Bug Fixes**: Fixed anti-nuke vanity-URL audit attribution to correlate the audit-log entry to the actual `vanity_url_code` change instead of accepting any recent GuildUpdate entry (B-BUG-1). Fixed guild restore to map recreated category ids so child channels keep their parent, and to restore role/channel `position` (B-BUG-2, B-BUG-3). Isolated per-case errors in the warn-decay sweep so one failing case can't starve the rest of the run (D-BUG-1). Fixed dashboard auth to stop clobbering `isBotOwner` right after it was correctly re-confirmed by the whoami RPC (A-BUG-1). Made the audit-log flush fall back to per-row inserts on batch failure instead of stalling forever behind one bad entry (C-BUG-1). Redis lock renewal failures are now tracked and logged instead of silently swallowed (C-BUG-2). Entity cache now clears optional fields on transition to empty instead of leaving stale data cached for 24h (C-BUG-3).
