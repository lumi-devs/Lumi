# Phase 4 — Appeals (schema + repo + RPC action + permit + public intake + review UI)

**Goal:** Ban/timeout appeal pipeline — confirmed missing in the audit; Wick's version (v5.2.0) has Approve/Deny/Deny+Blacklist/Dismiss review actions and DMs an appeal link on punishment.

Same shape as Phase 3 (schema → repository → permit node in both files → RPC action → dashboard actions → UI), with one added wrinkle: the **submission** side needs to be reachable by a punished user who may not have dashboard access at all — that's a public, unauthenticated route (`apps/dashboard/src/app/appeal/[guildId]/page.tsx` or similar), separate from the guild-authenticated area under `guild/[guildId]/*`. This needs its own auth/rate-limiting story (likely a signed token embedded in the DM'd appeal link rather than session auth) — worth its own focused design pass before writing code, not something to improvise mid-implementation.

Model: `Appeal` (`id`, `guildId`, `userId`, `caseId` FK to `ModerationCase`, `status` enum: pending/approved/denied/denied_blacklisted/dismissed, `message`, `reviewedBy`, `reviewedAt`). Add `mod.appeals` permit node following the same both-files rule as Phase 3.
