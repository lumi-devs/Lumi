---
"@lumi/contracts": patch
"@lumi/core": patch
"@lumi/dashboard": patch
---

Dashboard bot-owner detection (`session.isBotOwner`) now comes from a new `auth.whoami` RPC that defers to the worker's `PermitResolver.isBotOwner`, instead of a separate `BOT_OWNERS` dashboard env var. This means the Discord application's actual owner is recognized automatically, the same way it already is for in-Discord commands — no manual env-var configuration needed, and one less place for bot-owner lists to drift out of sync.
