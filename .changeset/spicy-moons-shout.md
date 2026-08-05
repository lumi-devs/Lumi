---
"@lumi/core": patch
"@lumi/dashboard": patch
---

Security fixes: addon/module management (`/repo`, `/download`, `/module`, and the hub panel's Add-ons and core-update actions) now requires a real Bot Owner instead of the `owner.*` permit node, which every guild owner satisfied; moderation commands now refuse targets that outrank the invoker; `/purge regex` screens user-supplied patterns for catastrophic backtracking before running them on the gateway loop; the dashboard's `guild.config.set` RPC now goes through `ConfigService` (schema validation, audit history, change hooks) instead of writing raw JSON; and the Discord OAuth2 access token is no longer placed on the NextAuth session (it was reachable from the browser via `/api/auth/session`).
