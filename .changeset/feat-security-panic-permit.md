---
"@lumi/core": minor
---

Adds `/panic` (admin-only server lockdown: pauses invites, mutes `@everyone`
in text channels with a one-button Revert) and `/permit` (grant/revoke/list
custom and enforced permit nodes on roles or members). The hub panel's
Permissions tab now grants permits through a role/user picker followed by a
node picker instead of the old free-text "Allow/Deny a Command" modal, which
wrote grants in a scheme (`chatInputCommandPath`) that the actual permit
precondition never checked — that dead code path
(`PermissionOverridesPrecondition`) and its unused `PermissionService`
methods are removed.
