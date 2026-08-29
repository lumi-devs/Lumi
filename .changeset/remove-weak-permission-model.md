---
"@lumi/core": minor
---

**Addon SDK & Core Permissions**: Removed legacy `PermissionLevel` enum and `resolvePermissionLevel`.
Authorization in Lumi is fully unified around granular permit nodes (`hasRequiredPermit(target, permitNode)`, `PermitResolver`, and `RequirePermitPrecondition`), respecting dynamic role positions, channel overrides, polarities, and anti-nuke quarantine.
