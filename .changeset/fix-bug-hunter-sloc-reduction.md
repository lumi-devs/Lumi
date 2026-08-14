---
"@lumi/core": patch
---

**Bug Fixes**: Removed unnecessary Redis locks in SecurityService and QuarantineAction for race condition fixes, removed over-defensive error handling in bootstrap and DownloaderService, fixed permission preconditions to properly reject commands outside guilds, fixed warn decay comparison logic (>= to >), added proper state cleanup in ping command to prevent memory leaks.

**Code Quality**: Consolidated dashboard RPC handler validation patterns with verifyGuildAccess helper, removed dead code exports (makeStatusBadge alias, deregisterRpcHandler), inlined ResolvePermitsOptions interface, removed unused parameters, reducing SLOC by 23 net lines while improving maintainability.
