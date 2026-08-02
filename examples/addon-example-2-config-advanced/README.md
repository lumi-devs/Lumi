# Config Advanced

Builds on [Hello World](../addon-example-1-hello-world) with a config schema that exercises every field type, and real persistence.

## What it shows

- `index.ts` - all five `cfg.*` field types in one schema: `boolean`, `number` (with `min`/`max`), `string`, `enum`, `channel` (optional, `required: false`).
- `commands/tag.ts` - a `BaseSubcommand` with five subcommands (`add`, `remove`, `get`, `list`, `reset`) routed via the `{ name, run }` mapping, all sharing one `CommandContext`-based implementation.
- `lib/store.ts` - persistence via `container.db.guildKV`, the store third-party addons use since they can't ship Prisma migrations. Shows the `targetId` (varying identifier) vs. `key` (collection name) convention.
- Reading the module's own config back at runtime (`enabled`, `max_tags`, `default_response`) to gate behavior.

## Commands

- `/tag add <name> <response>` - create or update a tag (enforces `max_tags`).
- `/tag get <name>` - look it up.
- `/tag remove <name>` - delete one tag.
- `/tag list` - list every tag in the server.
- `/tag reset` - delete all tags in the server.

## Config

| Field | Type | Default |
| :--- | :--- | :--- |
| `enabled` | boolean | `true` |
| `max_tags` | number (1-100) | `25` |
| `default_response` | string | `"That tag doesn't exist."` |
| `trigger_mode` | enum (`exact` \| `contains`) | `exact` |
| `log_channel_id` | channel (optional) | *(unset)* |

`trigger_mode` and `log_channel_id` are declared for the dashboard/config-panel walkthrough but aren't wired into command logic here - see [Full Featured](../addon-example-3-full-featured) for a config field that actually drives behavior end-to-end via a service and scheduled task.
