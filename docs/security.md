# Security Suite

Lumi's Wick-style protection is split across the `security` module
(anti-nuke, join-gate, verification, panic mode) and the `filter` module's
heat escalation. All thresholds live in `/lumi panel` → **Modules** →
**Security** / **Auto-Filter**, grouped into subsections.

## Anti-Nuke Detector

`packages/core/src/modules/security/listeners/auditLogEntryCreate.ts` watches
`GuildAuditLogEntryCreate` and maps entry actions to a "kind" (ban, kick,
channel delete, role delete, webhook create). A sliding window per executor
(`window_seconds`) counts actions of each kind; crossing the per-kind limit
(`max_bans`, `max_kicks`, `max_channel_deletes`, `max_role_deletes`,
`max_webhook_creates`) triggers `response`:

- `log` - post an alert to `log_channel_id` (falls back to the mod log channel) only.
- `quarantine` - apply the shared quarantine action (same mechanism as `/quarantine`) and log a moderation case.
- `ban` - ban the executor outright.

The guild owner, the bot itself, members with `trusted_role_ids`, and anyone
holding an **enforced** permit are always exempt - enforced permits are the
only grant type that survives quarantine (see [Permits](#permits) below).

> **Standalone-gateway note**: audit-log events require the `GuildModeration`
> intent. When running gateway/worker as separate processes, restart both
> after enabling this feature so the intent takes effect.

## Join-Gate & Verification

- **Account-age gate**: `min_account_age_hours` kicks/flags accounts younger
  than the threshold on join (`0` disables the check).
- **Raid detection**: a rolling join counter (`raid_join_count` joins within
  `raid_window_seconds`) flips the guild into raid mode; joiners during raid
  mode get `raid_action` (`kick` / `timeout` / `quarantine`) instead of the
  normal welcome flow.
- **Verification**: `/verifypanel` posts a persistent Components V2 panel
  with a Verify button. Clicking it shows a row of emoji buttons and a target
  sequence to click in order; completing it grants `verified_role_id` and
  removes `verification_pending_role_id` (if configured). Members who don't
  verify within `verification_timeout_minutes` are optionally kicked
  (`verification_kick_on_timeout`). This is a basic click-sequence challenge,
  not a real CAPTCHA - it stops simple join-bots, not targeted abuse.

## Panic Mode

`/panic` (requires the `admin.*` permit) is a one-command lockdown for active
incidents:

1. Shows a confirm/cancel prompt (20s timeout, cancels safely if unanswered).
2. On confirm: pauses server invites (`guild.disableInvites(true)`) and sets
   `@everyone`'s `SendMessages` to `false` across every configured text
   channel (`panic_lock_channel_ids`), or every `GuildText`/`GuildAnnouncement`
   channel if left blank.
3. Snapshots each channel's prior `@everyone` overwrite before changing it,
   and the invite-pause state, into `PanicState` (Prisma).
4. Edits are sequential with a small delay and capped at 40 channels per run
   to stay clear of Discord's per-channel permission-overwrite rate limit;
   failures on individual channels don't abort the rest.

The resulting status card carries a **Revert** button
(`sec:panic:revert`) that restores every snapshotted overwrite and resumes
invites in one click, re-checking the `admin.*` permit at click time.
Re-running `/panic` while already active shows the same status card again
instead of re-confirming - this is the recovery path if the original
ephemeral message was dismissed or expired.

## Filter Heat Escalation

The `filter` module scores repeat offenses instead of only reacting to single
messages. Each qualifying event adds to a per-member heat counter that decays
over time:

| Config key | Effect |
| :--- | :--- |
| `heat_per_message` | Heat added per message sent |
| `heat_per_mention` | Heat added per mention in a message |
| `heat_per_duplicate` | Heat added when a message repeats a recent one |
| `heat_per_filter_hit` | Heat added when the existing regex/substring filter blocks something |
| `heat_decay_per_minute` | Heat removed per minute of good behavior |
| `heat_warn` / `heat_timeout` / `heat_quarantine` | Heat thresholds that trigger each escalation tier |
| `heat_timeout_minutes` | Duration of the timeout tier |

Heat is stored in Redis (`INCRBYFLOAT` with decay computed on read - no cron
job needed) and escalation reuses the same moderation actions as the manual
mod commands, so cases show up in `/cases` like any other action.

## Permits

Every command declares a `requiredPermit` node (e.g. `admin.*`, `mod.*`).
Two grant types exist:

- **Custom** - removable; anti-nuke quarantine strips these from a
  compromised account automatically.
- **Enforced** - survives quarantine; reserve these for genuinely trusted
  admins/roles you never want anti-nuke to lock out by mistake.

Manage grants with `/permit grant|revoke|list custom|enforced` (role or user
target), or through the hub panel's **Permissions** tab, which walks the same
target picker → node picker flow. `admin.*`/`mod.*`-style wildcard nodes and
every node a loaded command actually checks are listed in the node picker
(via `collectKnownPermitNodes()` in `#lib/permissions/nodes.js`), so there's
no way to grant a node that doesn't correspond to a real permission check.
