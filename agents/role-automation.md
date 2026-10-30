# Role Automation

Supermodule `roles` (`modules/roles/`) contains three independently toggleable
submodules:

| Submodule          | Directory                  | Permit node        |
| ------------------ | -------------------------- | ------------------ |
| `roles-autorole`   | `modules/roles/autorole`   | `roles.autorole`   |
| `roles-voiceroles` | `modules/roles/voiceroles` | `roles.voiceroles` |
| `roles-bulkrole`   | `modules/roles/bulkrole`   | `roles.bulkrole`   |

All three require **Manage Server** or their permit node. Commands are Components
V2 cards only. Shared access, config, and hierarchy helpers live in
`modules/roles/shared.ts`.

## Autorole

`roles-autorole` assigns multiple configured roles when a member joins.

### Storage

Settings are stored in `Guild.settings` under `roles-autorole`:

```ts
{
  enabled: boolean;
  paused: boolean;
  roleIds: string[];
  delaySeconds: number;
  minAccountAgeHours: number;
  requiredRoleIds: string[];
  ignoredRoleIds: string[];
  ignoreBots: boolean;
  onlyOnJoin: boolean;
}
```

Delayed assignments are durable in `autorole_pending` (`AutorolePending`): one
row per guild and member with the pending role IDs and `assign_at`.

### Flow

1. `guildMemberAdd` reads config and runs `evaluateAutoroleCandidate`.
2. Filters: enabled/paused, configured roles, bot accounts, minimum account age,
   required roles (any-of), ignored roles (any-of), and only-on-join.
3. Roles already held are removed from the assignment list.
4. `delaySeconds = 0` assigns immediately; otherwise the role list is upserted
   into `AutorolePending`. Repeated joins merge role IDs and keep the earliest
   assignment time.
5. The `*/1 * * * *` task processes due rows. Missing guilds/members and
   disabled modules discard the row. Role adds use hierarchy checks and retry
   on the next tick when a role cannot be assigned.

### Hierarchy

The bot must own a role higher than every target role. Managed roles and
`@everyone` cannot be assigned. Guild owner status bypasses the position check.

### Commands

- `/autorole set roles:<mentions/ids> [delay]`
- `/autorole filters [min_age_hours] [required_roles] [ignored_roles] [ignore_bots] [only_on_join]`
- `/autorole delay seconds:<n>`
- `/autorole run [user]` — process due rows now; with `user`, queue that member
  using the filters. `only_on_join` rejects a manual member run.
- `/autorole resume` — clear `paused`.
- `/autorole cancel [user]` — delete all or one member's pending rows.
- `/autorole status` — show config and pending count.

## Voice Roles

`roles-voiceroles` assigns a role while a member is in a mapped voice or stage
channel.

### Storage

Settings are stored in `Guild.settings` under `roles-voiceroles`:

```ts
{
  enabled: boolean;
  defaultGraceSeconds: number;
}
```

Channel mappings live in `voice_roles` (`VoiceRole`): `channelId`, optional
`categoryId`, `roleId`, `graceSeconds`, and `enabled`. The unique key is
`guildId + channelId`.

Active memberships are durable in `voice_role_sessions` (`VoiceRoleSession`):
`guildId`, `userId`, `channelId`, `roleId`, `joinedAt`, and `graceUntil`.

### Flow

1. `voiceStateUpdate` ignores updates outside enabled modules/config.
2. Leaving a mapped channel either sets `graceUntil = now + graceSeconds` or
   removes the role and deletes the session when grace is zero.
3. Joining a mapped channel upserts a session with `graceUntil = null` and adds
   the role if it was not already held.
4. Direct channel mappings win; when no channel matches, an enabled mapping
   whose `categoryId` equals the channel's parent category is used.
5. The `*/1 * * * *` task removes roles and sessions whose grace has expired.
   Missing members discard the session.

### Hierarchy

Role add and remove use the same hierarchy checks as autorole.

### Commands

- `/voiceroles add channel:<voice/stage> role:<role> [grace] [category]`
- `/voiceroles remove channel:<channel>`
- `/voiceroles list`
- `/voiceroles toggle channel:<channel>`

Removing a mapping also deletes its sessions.

## Bulk Role

`roles-bulkrole` runs durable add/remove role jobs across filtered members.

### Storage

Settings are stored in `Guild.settings` under `roles-bulkrole`:

```ts
{
  enabled: boolean;
  batchSize: number;
}
```

Jobs live in `bulk_role_jobs` (`BulkRoleJob`): `roleId`, `action`, JSON `filter`,
`status`, `total`, `processed`, `failed`, `lastError`, and `createdBy`.

Statuses are `pending`, `running`, `paused`, `completed`, `cancelled`, and
`failed`.

### Filters

The JSON filter has a `mode`, `roleIds`, `before`, and `after`:

- `all`
- `has_roles` — has any listed role
- `missing_roles` — has none of the listed roles
- `joined_before` / `joined_after` — ISO timestamps
- `only_humans` / `only_bots`

A dry run counts matched members and members that actually need a role change.
Only members needing a change are counted toward the job total.

### Flow

1. `/bulkrole start` validates the filter and role hierarchy, snapshots members,
   and either previews or creates a job.
2. The `*/1 * * * *` worker picks `pending`/`running` jobs, verifies the guild,
   role, and hierarchy, fetches members, and processes one `batchSize` batch.
3. Successful changes increment `processed`; failures increment `failed` and set
   `lastError`. Remaining work returns the job to `pending`; an exhausted job
   becomes `completed`, or `failed` when every member failed.
4. `pause`, `resume`, and `cancel` only change status. `resume` turns `paused`
   into `pending`, so work continues from persisted counters. Terminal jobs are
   never revived.

### Commands

- `/bulkrole start role:<role> action:<add|remove> filter:<mode> [filter_roles] [before] [after] [dry_run]`
- `/bulkrole status [job]`
- `/bulkrole progress [job]`
- `/bulkrole pause job:<id>`
- `/bulkrole resume job:<id>`
- `/bulkrole cancel job:<id>`

`start` defaults to `dry_run: true`.

## Tests

Pure logic is isolated from Discord and Prisma so it can be unit tested:

- `modules/roles/autorole/tests/logic.test.ts` — filters, role selection, delay,
  due selection, pending merge.
- `modules/roles/voiceroles/tests/logic.test.ts` — channel/category mapping and
  grace selection.
- `modules/roles/bulkrole/tests/filter.test.ts` — filter matching, dry-run
  counts, change planning.
- `modules/roles/bulkrole/tests/worker-logic.test.ts` — resume/cancel/progress
  and batch selection.

Run with:

```sh
nix develop --command bunx vitest run modules/roles
nix develop --command bun run typecheck
```

## Limitations

- Autorole filters are evaluated at join time. Manual runs only apply when
  `onlyOnJoin` is disabled.
- Autorole pending rows are not retried forever after a hierarchy failure; they
  stay queued until the role hierarchy or bot permissions change.
- Voice category mappings use one stored representative channel per mapping.
  Several category mappings for the same category resolve to the first enabled
  row returned by the database.
- Bulk jobs re-fetch and re-evaluate the full member list on every tick. On very
  large guilds this is intentionally throttled by `batchSize` per minute.
- Bulk role progress counts changes attempted, not members inspected.
