---
"@lumi/core": minor
---

**Addon SDK**: Removed `resolvePermissionLevel`. It never consulted `PermitResolver`, so
addons using it for authorization couldn't see permit deny rules or anti-nuke quarantine -
a weaker check than what first-party commands get via `RequirePermitPrecondition`. It had
no in-repo callers; only the addon SDK re-exported it. `lumi/permissions` now re-exports
`hasRequiredPermit(target, permitNode)` instead, which does consult `PermitResolver` and
is the same check interaction handlers use internally. `PermissionLevel` is unchanged.
