---
"@lumi/core": minor
"@lumi/dashboard": minor
"@lumi/contracts": minor
---

Wick-bot feature parity across the `security` and `filter` modules:

- **Heat System v2** (`filter`): new heat factors (attachments, emoji, links, a webhook multiplier), an escalating timeout multiplier for repeat offenders, heat panic mode (instant timeout for flagged raiders during an active panic window), and auto-lockdown on guild-wide mention flooding with a durable scheduled auto-unlock.
- **Anti-Nuke hardening** (`security`): quarantine hold (reverts unauthorized role changes on a quarantined member), vanity URL change protection, automatic revert of any dangerous permission granted to `@everyone`, and an option to lock moderation commands while panic mode is active.
- **Backup/Restore** (`security`): a new `GuildBackup` model, an hourly snapshot sweep of role/channel structure for guilds with Anti-Nuke on, a `/restore` command, and auto-restore on panic revert.
- **Verification modes** (`security`): `none` (press-to-enter) and `web` (dashboard-hosted challenge) modes alongside the existing emoji captcha, plus suspicious-account-only targeting.
- **Join Gate filter expansion** (`security`): independent no-avatar / min-age / unverified-bot / username-pattern filters, each with its own action.
- **Join Raid algorithmic flags** (`security`): suspicious-account-scoped raid response, username-similarity and account-creation-clustering heuristics.
- **Guided Setup wizard** (dashboard): one-click bootstrap that creates the quarantine role and log channels and enables Anti-Nuke/Join Gate with sane defaults.
