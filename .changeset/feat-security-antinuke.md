---
"@lumi/core": minor
"@lumi/event-bus": minor
"@lumi/gateway": patch
---

New `security` module with a Wick-style anti-nuke detector: watches audit-log entries for mass bans, kicks, channel/role deletions, and webhook creation, counts per-executor actions in a sliding Redis window, and responds with automatic quarantine, ban, or a logged alert (guild owner, the bot, and configured trusted roles are exempt). Quarantine and mod-log helpers move to `#lib/moderation` for cross-module reuse. The distributed worker now consumes `GUILD_AUDIT_LOG_ENTRY_CREATE`, ban, role, webhook, and invite dispatches (fixing ban logging in split mode), and the standalone gateway ships the GuildModeration, GuildInvites, and GuildWebhooks intents.
