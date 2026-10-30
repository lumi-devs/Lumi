# Custom Commands

Module: `modules/custom-commands/` (`custom-commands`, guild-only).
Settings key: `customCommands` (manifest `configKey`).
Entry: `/customcommand` with alias `/cc`.

The module lets server managers author commands without code. Command
definitions, responses, schedules, and per-user key/value data live in Postgres;
nothing is evaluated as JavaScript. Output is always a `@lumi/ui` card.

## Commands

Authoring and management require **Manage Server**, **Administrator**, guild
ownership, or the `cc.manage` permit node. `/customcommand run` is available to
ordinary members and only checks the individual command's permission nodes.

| Command                                                    | Purpose                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/customcommand run <name> [args]`                         | Run a custom command without registering a dynamic slash command                                              |
| `/customcommand create`                                    | Create a command (`name`, `trigger_type`, `trigger`, `response`, optional group/cooldown/permissions/enabled) |
| `/customcommand edit <name>`                               | Change any definition field; use `group:none` to ungroup                                                      |
| `/customcommand delete <name>`                             | Delete a command and its schedule                                                                             |
| `/customcommand list [page]`                               | List commands, 25 per page                                                                                    |
| `/customcommand show <name>`                               | Show definition, responses, permissions, and schedule                                                         |
| `/customcommand export [name]`                             | Export JSON as a file (one command or the whole guild)                                                        |
| `/customcommand import [data] [file] [overwrite]`          | Strict JSON import; `overwrite` updates existing names                                                        |
| `/customcommand group action:create\|delete\|rename\|list` | Manage command groups                                                                                         |
| `/customcommand schedule action:set\|clear\|list`          | Set cron or interval schedules                                                                                |
| `/customcommand kv action:get\|set\|incr\|del\|list`       | Manage the invoker's own KV data                                                                              |
| `/customcommand diagnose [name]`                           | Report trigger, template, response, and schedule errors                                                       |

`/customcommand run` is the only slash invocation route for custom commands.
The module never dynamically registers application commands.

## Trigger types

| Type                             | Behaviour                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `command`                        | Message prefix command (`<prefix><trigger>`) or `/customcommand run <name>`  |
| `prefix`                         | Raw message starts with the trigger, which may include its own prefix        |
| `exact`                          | Whole trimmed message equals the trigger (case-insensitive)                  |
| `startsWith`                     | Trimmed message starts with the trigger (case-insensitive)                   |
| `contains`                       | Trimmed message contains the trigger (case-insensitive)                      |
| `regex`                          | Safe regex (case-insensitive, Unicode) against the trimmed message           |
| `reactionAdd` / `reactionRemove` | Reaction emoji matches the trigger (`👍`, `name:id`, or `<:name:id>`)        |
| `button` / `select` / `modal`    | Component custom ID matches exactly, or a trailing `*` prefix match          |
| `interval`                       | Run on a persisted interval (`CustomCommandSchedule.intervalSeconds`)        |
| `cron`                           | Run on a persisted five-field cron expression (`CustomCommandSchedule.cron`) |

Only the first matching message command runs per message. Schedules can coexist
with a command's primary trigger. Scheduled output is sent to the module's
`scheduleChannelId` setting; scheduled commands are skipped when that setting is
unset.

## Template language

Responses are rendered with a restricted Mustache-style interpreter. The parser
builds an AST; there is no `eval`, `Function`, dynamic import, filesystem, or
network access. Property paths only read the explicit context objects below and
refuse `__proto__`, `prototype`, and `constructor`.

### Placeholders

```text
{{user.id}} {{user.username}} {{user.displayName}} {{user.mention}}
{{member.displayName}} {{member.nickname}} {{member.joinedAt}}
{{channel.name}} {{channel.mention}}
{{role.name}} {{role.id}}
{{guild.name}} {{guild.memberCount}}
{{target.username}}
{{args.0}} {{args.1}} {{args.raw}} {{args.length}}
{{trigger.type}} {{trigger.value}}
{{modal.field_name}} {{select.value}}
{{message.content}} {{message.url}}
{{now.iso}} {{now.unix}}
```

`args[0]` is equivalent to `args.0`. Quoted arguments are supported on prefix
and slash-run invocations.

### Filters

Filters use `{{value | filter}}` or `{{value | filter:arg}}`:

`upper`, `lower`, `title`, `trim`, `reverse`, `length`, `truncate:N`,
`default:value`, `json`, `urlencode`, `number`, `ordinal`, `join:separator`,
`first`, `last`, `keys`, `values`, `replace:find:replacement`, `mention`,
`channelmention`, `rolemention`.

### Blocks

```text
{{#if user.bot}}bot{{else}}human{{/if}}
{{#unless args.length}}no arguments{{/unless}}
{{#range 1 5}}{{index}}={{value}} {{/range}}
{{#range 0 10 2}}{{value}} {{/range}}
```

Comparisons support `==`, `!=`, `>`, `>=`, `<`, `<=`, `and`/`&&`, `or`/`||`,
`not`/`!`, parentheses, strings, numbers, `true`, `false`, and `null`. A `range`
exposes `value`, `index`, `first`, and `last`.

### KV functions

Templates can read and update the invoking user's KV scope through whitelisted
functions. Every call counts against the per-run KV budget.

```text
{{kv.get("score")}}
{{kv.set("name", "Ada")}}
{{kv.set("token", "abc", 3600)}}
{{kv.incr("score")}}
{{kv.incr("score", 5)}}
{{kv.del("temporary")}}
```

`kv.set` renders nothing; `kv.get` renders the stored value; `kv.incr` renders
the new number; `kv.del` renders `true` or `false`. Scheduled commands use the
command author's KV scope.

## Responses

`responses` is a JSON array with 1–20 entries. Each entry is either a string or a
card spec:

```json
[
  "Plain templated text",
  {
    "title": "Score",
    "body": ["{{user.mention}}", "Score: {{kv.get(\"score\")}}"],
    "accent": "success"
  }
]
```

Card accents: `success`, `warning`, `error`, `gold`, `purple`, `cyan`. Every
entry becomes a Components V2 card through `@lumi/ui`. No Discord embeds are
used. If the input is plain text rather than JSON, it is stored as one string
response.

## Schedules

`/customcommand schedule action:set name:<name> cron:"*/10 * * * *"` or
`interval:5m`. Exactly one of `cron` or `interval` is required. Intervals have a
10 second floor. Timezones are IANA names and default to `UTC`. A module task
polls due schedules every minute; the shared scheduler's Redis lock makes each
poll distributed-safe. The task advances `nextRunAt` before executing to avoid
duplicate runs across replicas.

## Hard limits

| Limit                        | Value                         |
| ---------------------------- | ----------------------------- |
| Commands per guild           | 200                           |
| Groups per guild             | 50                            |
| Responses per command        | 20                            |
| Rendered output per run      | 10 KB                         |
| KV operations per run        | 100                           |
| Discord API sends per run    | 10                            |
| Response render/send timeout | 500–15,000 ms (default 5,000) |
| KV keys per user             | 100                           |
| KV key length                | 128 characters                |
| KV value size                | 8 KB JSON                     |
| KV TTL                       | 365 days                      |
| Template length              | 20,000 characters             |
| Template AST nodes           | 5,000                         |
| Interpreter steps            | 50,000                        |
| Template nesting             | 32                            |
| Range iterations             | 1,000                         |
| Import payload               | 100 KB                        |
| Import commands / groups     | 100 / 50                      |
| Cooldown                     | 0–86,400 seconds              |
| Name / description           | 64 / 200 characters           |
| Trigger / regex              | 200 characters                |

Reaction scripts are not supported. There is no `exec`/`execAdmin` helper: a
custom command cannot run arbitrary JavaScript, shell commands, bot internals, or
filesystem/network operations.

## Permission model

- Management access: guild owner, `Administrator`, `Manage Server`, or the
  `cc.manage` permit node.
- Execution access: if `permissionNodes` is empty, everyone may run the command.
  Otherwise at least one listed node must evaluate as allowed for the user,
  channel, and roles.
- KV slash management is scoped to the invoking user and still requires
  management access. Templates only access the invoking/author KV scope.
- Quarantine and permit denial rules are enforced by the normal permit
  resolver; the module does not bypass them.
- Import/export never includes tokens, credentials, user IDs, or bot internals.
  `createdBy` is replaced with the importing user.

## Security notes

- Regex triggers reject backreferences, lookbehind, and nested repetition, and
  are length-limited to reduce ReDoS risk.
- Every interpreter evaluation has step, depth, range, output, and KV budgets.
- Only plain context snapshots are exposed. Discord client objects, permission
  objects, and arbitrary prototypes are not accessible.
- Schedules require an explicit output channel. A missing channel logs a warning
  and skips execution rather than guessing a destination.
- Component/reaction triggers only match exact custom IDs or emoji values; a
  custom command cannot observe unrelated interactions.

## Database

| Table                                                | Use                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `custom_command_groups` (`CustomCommandGroup`)       | Guild-local groups, unique by guild and name                                                               |
| `custom_commands` (`CustomCommand`)                  | Definitions: name, trigger type/value, JSON responses, enabled, cooldown, permission nodes, creator, group |
| `custom_command_schedules` (`CustomCommandSchedule`) | One schedule per command: cron or interval, timezone, next/last run                                        |
| `custom_command_kv` (`CustomCommandKv`)              | Per-guild, per-user JSON key/value entries with optional expiry, unique by guild/user/key                  |

Settings are stored under `Guild.settings.customCommands` and validated with
`CustomCommandsConfigSchema`.
