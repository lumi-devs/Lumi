---
"@lumi/core": minor
---

Join-gate raid detection and member verification for the `security` module. New members can be screened by account age and join-burst rate (kick, timeout, or quarantine during a raid), and an emoji-sequence captcha replaces DM-based verification: admins post a persistent Components V2 panel with `/verifypanel`, and clicking Verify runs the challenge entirely in an ephemeral, in-place interaction (no reliance on open DMs). Passing grants the verified role and strips the pending role; a periodic sweep evicts members who never verify when kick-on-timeout is enabled. Panel and panic state persist through a new `SecurityRepository` (proper Prisma models) rather than the generic module KV store.
