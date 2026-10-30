# Reminders

Module: `modules/reminders/` (`reminders`, config key `reminders`). Guild-only.

## Commands

`/remind` is a subcommand group. The prefix alias `reminders` maps to the same
command.

- `/remind create duration:<10s|5m|2h|3d|1w|1h30m> text:<message> [channel] [repeat]`
  — creates a reminder for the invoking user. Duration is capped at one year.
  `channel` is the fallback channel and defaults to the current channel.
  `repeat` is a five-field UTC cron expression and is rejected unless
  `allowRecurring` is enabled.
- `/remind list` — lists the caller's active reminders, soonest first.
- `/remind cancel id:<id>` — cancels one of the caller's reminders. IDs can be
  shortened to any unambiguous prefix of at least four characters.
- `/remind clear confirm:<true|false>` — cancels every active reminder owned by
  the caller.
- `/remind snooze id:<id> duration:<duration>` — moves an active reminder to
  `now + duration` and resets its retry state.

All command responses are ephemeral Components V2 cards from `@lumi/ui`.

## Behaviour

- Every command rejects DMs, missing guild IDs, a disabled module, and a
  disabled `enabled` setting.
- Creating a reminder enforces `maxPerUser` against the caller's active rows.
- The fallback channel is validated as text-based and requires the bot to have
  View Channel and Send Messages there.
- Delivery runs every minute (`*/1 * * * *`). The scheduler's Redis lock prevents
  concurrent runs; each row is then claimed with a conditional
  `pending|retry:N -> processing` update.
- Delivery order is DM first, then the original channel, then
  `fallbackChannelId`, when `dmFallback` is enabled.
- Successful delivery sets `deliveredAt` and marks the row `delivered`.
  Recurring rows return to `pending` with `remindAt` set to the next cron
  occurrence.
- Failed delivery increments a retry counter (`retry:1`, `retry:2`) with a
  backoff of 5 and 10 minutes. After three failed attempts the row becomes
  `failed`. Rows left in `processing` for more than 15 minutes are reclaimed.
- Retention cleanup runs hourly (`*/60 * * * *`) and deletes delivered rows whose
  `deliveredAt`, and cancelled/failed rows whose `createdAt`, are older than
  `retentionDays`.
- Recurring reminders run in UTC. Invalid or impossible cron expressions are
  rejected at creation.

## Database

Uses the existing `Reminder` model (`reminders` table):

- `id`, `guildId`, `userId`, `channelId`, `message`, `remindAt`
- `deliveredAt`, `status`, `recurringCron`, `createdAt`

Statuses: `pending`, `processing`, `retry:<n>`, `delivered`, `cancelled`,
`failed`.

## Configuration

Stored per guild under `reminders`:

| Key                 | Type    | Default | Purpose                                      |
| ------------------- | ------- | ------- | -------------------------------------------- |
| `enabled`           | boolean | `true`  | Deliver reminders for the guild              |
| `maxPerUser`        | number  | `25`    | Maximum active reminders per member          |
| `dmFallback`        | boolean | `true`  | Fall back to channels when DMs fail          |
| `fallbackChannelId` | channel | none    | Final channel fallback                       |
| `retentionDays`     | number  | `30`    | Days to keep delivered/cancelled/failed rows |
| `allowRecurring`    | boolean | `false` | Allow cron-based recurring reminders         |

## Permissions

The command is self-service: members manage only their own reminders, and
ownership is checked by `guildId` + `userId` before cancel, clear, or snooze.
No permit node is required. The module itself must be enabled for the guild, and
the bot needs View Channel and Send Messages in any fallback channel.

## Tests

Focused tests live in `modules/reminders/tests/` and avoid Discord and the
database:

- `duration.test.ts` — duration parsing, formatting, and the one-year cap
- `policy.test.ts` — due selection, retry policy, retention filter, per-user limit
- `cron.test.ts` — recurring cron validation and next-occurrence calculation
