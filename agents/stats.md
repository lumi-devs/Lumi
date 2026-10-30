# Server Stats

Module: `modules/stats/` (`stats`, config key `stats`). Guild-only. It owns
message, voice, member, status, and boost statistics and renders Statbot-style
PNG cards with Lumi branding through `canvas`.

## Commands

One top-level command group, `/stats`, with subcommands:

| Subcommand                 | Shows                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `/stats server`            | Server overview: messages, voice, contributors, top members/channels, message + voice chart |
| `/stats members`           | Member counts, joins, leaves, top message/voice members, member chart                       |
| `/stats channels`          | Message and voice activity with channel averages and top channels                           |
| `/stats status`            | Online, idle, DnD, and offline series plus current server totals                            |
| `/stats messages`          | Message lookback, range boxes, top message users/channels, message chart                    |
| `/stats voice`             | Voice lookback, range boxes, top voice users/channels, voice chart                          |
| `/stats user [target]`     | Message/voice ranks, 1d/7d/30d/60d totals, top channels, combined chart                     |
| `/stats top [type] [page]` | Paged leaderboards: message users, voice users, message channels, voice channels            |

Do not add separate `/server`, `/messages`, `/chart`, or `/top` commands.

Every statistic command accepts `lookback` (`1d`, `7d`, `30d`, `60d`; default
`7d`). The hard maximum lookback is 60 days.

Every rendered card has button rows for:

- Refresh
- Chart / Overview toggle
- `1d` / `7d` / `30d` / `60d` lookback selection
- Top leaderboards also get category buttons and Prev/Next pagination

Only the invoking user can operate a card. Cards are Components V2 only; no
embeds. If PNG generation fails, the same data is rendered as a text card with
the same buttons.

## Tracking

- Messages: one increment per non-bot `messageCreate`, stored in hourly
  `StatsMessageBucket` rows keyed by guild, channel, user, and bucket start.
- Voice: active voice sessions are held in memory and flushed into minute
  buckets on `voiceStateUpdate` (join, move, leave, mute-independent). Sessions
  are also flushed on member leave and module unload.
- Joins/leaves: `StatsEvent` rows with `join` / `leave`.
- Boosts: `StatsEvent` rows with `boost` / `unboost` when `premiumSince`
  changes.
- Statuses: presence counts (`online`, `idle`, `dnd`, `offline`) plus member,
  voice, channel, role, and boost counts are snapshotted every 10 minutes.
- Ignored channels and members with ignored roles are excluded. Bots are always
  excluded.
- No emoji, activity, or stat-channel tracking exists.

## Snapshots and retention

- Scheduler task `stats:snapshot` runs every 10 minutes and upserts one
  `StatsSnapshot` per enabled guild at the bucket start.
- Scheduler task `stats:retention` runs daily and deletes rows older than the
  90-day hard cap from every Stats table.
- No daily rollups are retained. Longer-range series are aggregated on query
  from raw/hourly buckets; charts are sampled to a fixed point count before
  rendering.

## Database tables

| Table                   | Prisma model         | Purpose                                              |
| ----------------------- | -------------------- | ---------------------------------------------------- |
| `stats_snapshots`       | `StatsSnapshot`      | 10-minute member/status/channel/role/boost snapshots |
| `stats_message_buckets` | `StatsMessageBucket` | Hourly per-guild/channel/user message counts         |
| `stats_voice_buckets`   | `StatsVoiceBucket`   | Per-minute per-guild/channel/user voice seconds      |
| `stats_events`          | `StatsEvent`         | Join, leave, boost, and unboost events               |

Indexes cover guild + time, guild + user + time, and guild + channel + time.

## Permissions and configuration

Config key `stats`:

- `public` (default `true`) — everyone may use `/stats`.
- `ignoredChannels` — channels excluded from tracking.
- `ignoredRoles` — members with any listed role excluded from tracking.

When `public` is off, `/stats` and its buttons require the `stats.view` permit
(`/permit create` can add it as a custom node). Discord managers, guild owners,
and bot owners still pass through normal permit evaluation.

## Tests

Unit tests live in `modules/stats/tests/stats.test.ts` and cover duration
parsing, bucket flooring, minute splitting, range aggregation, averages,
sampling, retention cutoff, top ordering, ranks, and formatting. They do not
touch Discord or the database.
