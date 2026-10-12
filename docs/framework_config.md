# Framework: Config

Per-module key/value settings with layered scopes. Reads cascade from the
most specific scope down to the default; writes land on the exact scope.

## Scopes

| Scope | Keyed by | Falls back through |
|---|---|---|
| `guild` (default) | guild | guild → global → default |
| `global` | - | global → default |
| `channel` | channel id | channel → guild → global → default |
| `role` | role id | role → guild → global → default |
| `user` | user id (global) | user → global → default |
| `member` | user id (in a guild) | member → user → guild → global → default |
| `custom` | `group:id` | custom → guild → global → default |

Custom scopes cover anything else (`{ kind: "custom", group: "menu", id }`).

## API

```ts
const defined = defineModuleConfig("my-module", Defaults);
defined.forGuild(services, guildId).get("key");
defined.forGlobal(services).get("key");
defined.forScope(services, guildId, { kind: "channel", id }).get("key");

const api = createModuleApi(services, "my-module", Defaults, guildId);
api.config.get("key");            // guild scope
api.configFor({ kind: "role", id }).set("key", value);
```

`getAll()` returns defaults merged with every stored layer. `clear(key)`
removes the key from the current scope only. Guild writes are audited to
the config history with the actor when one is passed.

Storage: `guild_module_config` for guild scope, `module_scoped_config`
for everything else, both Valkey-cached with exact-key invalidation on
write. Merge happens at read time, so scoped reads always see fresh
guild values.
