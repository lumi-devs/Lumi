# Configuration

Two files control what a self-hoster usually wants to change. Both are optional —
the bot ships with working defaults and merges your values on top, so you only set
the keys you care about.

## `bot.json`

Presence, colors, links, permission-tier names, and UI defaults.

- `presence` — `activityType` (0 Playing, 1 Streaming, 2 Listening, 3 Watching, 5 Competing), `activityText`, `status` (`online`/`idle`/`dnd`/`invisible`)
- `branding.colors` — embed/card colors as decimal integers (e.g. `0x5865F2` = `5793266`)
- `branding.links` — `supportServer` / `website` / `github` URLs surfaced in help
- `permissions.names` — display labels for the permission tiers
- `ui.defaultListPerPage` — page size for paginated lists

## `emojis.json`

Overrides for named emojis. A value can be a unicode glyph (`🟢`) or a custom
Discord emoji in `<:name:id>` form. Any key you omit falls back to the built-in
unicode set, so this file is safe to trim. To use your own server's emoji, paste
its `<:name:id>` (right-click → Copy, or `\:emoji:` in chat).

---

The rest of this directory (`postgres/`, `redis/`, `rabbitmq*`, `observability/`,
`advanced.config`) is infrastructure config for the Docker/Compose stack, not bot
settings.
