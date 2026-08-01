---
"@lumi/core": minor
"@lumi/event-bus": minor
---

New `security` module with a Wick-style anti-nuke detector: watches audit-log entries for mass bans, kicks, channel/role deletions, and webhook creation, counts per-executor actions in a sliding Redis window, and responds with automatic quarantine, ban, or a logged alert (guild owner, the bot, and configured trusted roles are exempt). Quarantine and mod-log helpers move to `#lib/moderation` for cross-module reuse. The worker ships the GuildModeration, GuildInvites, and GuildWebhooks intents so audit-log, ban, role, webhook, and invite dispatches reach the module.
