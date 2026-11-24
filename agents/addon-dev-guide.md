# Add-on development guide

Add-ons are third-party flat modules. They follow the same module contract as
bundled modules, are installed from git repositories, and run in-process.

## Differences from bundled modules

| Aspect           | Bundled                        | Add-on                             |
| ---------------- | ------------------------------ | ---------------------------------- |
| Location         | `modules/<category>/<module>/` | `data/addons/<module>/`            |
| Origin           | `bundled`                      | `addon`                            |
| Install          | Deployed with the bot          | `/lumi` → Add-ons, bot owners only |
| Update           | Deploy the bot                 | Repo update or auto-update         |
| npm dependencies | Root `package.json`            | `manifest.requirements`            |
| Trust            | Full                           | Static validation on install       |

## Structure

Each add-on is one top-level directory with a `manifest.json` and an entry file.
The add-on directory name must equal `manifest.name` so the downloader can
install and update it by name. The loader also accepts nested bundled modules,
but add-on repositories stay flat.

```
my-addon/
├── manifest.json
├── index.ts
└── <feature files>
```

Use the same `defineModule` shape and manifest contract as bundled modules.

## Manifest

```json
{
  "apiVersion": 2,
  "name": "my-addon",
  "displayName": "My Add-on",
  "emoji": "🔌",
  "description": "What the add-on does",
  "version": "1.0.0",
  "category": "Add-ons",
  "entry": "index.ts"
}
```

- The manifest declares `entry`, `dependencies`, `requirements`, `conflicts`,
  `capabilities`, `configFields`, and an optional `category`.
- `entry` is required and loaded directly by Bun; ship TypeScript, not compiled JS.
- `requirements` are npm registry specs installed with
  `bun add --production --ignore-scripts --no-save`.
- `dependencies` are module names and semver ranges.
- `conflicts` lists module names that cannot be installed alongside this one.

## Security model

Validation is static; add-ons are **not sandboxed** and run with the bot's
permissions.

Rejected by validation:

- Imports of internal packages: `@lumi/db`, `@lumi/cache`, `@lumi/redis`,
  `@lumi/module-runtime`, `@lumi/downloader`, `@lumi/permits`,
  `@lumi/observability`, `@lumi/scheduler`, `@lumi/admin`, `@lumi/core`
- Relative imports that escape the add-on directory
- Bare imports that are neither a host runtime package nor declared in
  `requirements`
- Vendored `node_modules`, `.npmrc`, or `bunfig.toml`
- A manifest name that does not match the directory name
- An invalid requirement spec

Allowed runtime imports:

- `discord.js`, `@discordjs/builders`, `@discordjs/formatters`, `zod`
- `@lumi/module-kit`, `@lumi/ui`, `@lumi/foundation`
- `node:*`, `bun`, `bun:*`
- Anything declared in `requirements`

## Services

Add-ons receive the same `ModuleServices` bag as bundled modules: `client`,
`permits`, `config` (a `ModuleConfigAccess`), `moduleConfig`, `modules`
(`{ isEnabled }`), `scheduler`, `ui`, `discord`, `observability`
(`{ healthMonitor, logger }`), `helpers`, `data` (a `ScopedDataStore`), and an optional `moduleName`.
Database and cache access goes through the `helpers` namespaces (`economy`,
`leveling`, `stats`, `tickets`, `roleMenus`, `roles`,
`security`, `verification`, `utility`, `moduleData`, `cache`). `prisma`, `redis`, the raw cache
client, `moduleLoader`, `moduleManager`, `configService`, and `addons` are not
part of the add-on services contract. See
[services.md](./services.md).

### Scoped Data Store (`services.data`)

Lumi v2 provides a first-class partitioned key-value store directly on `services.data`, surpassing Redbot's `Config` API:

```ts
// Guild scope: partitioned per guild
await services.data?.guild(guildId).set("welcomeMessage", "Hello!");
const msg = await services.data?.guild(guildId).get<string>("welcomeMessage", "Default");

// User scope: global user profile
await services.data?.user(userId).set("reputation", 42);

// Member scope: user within a specific guild
await services.data?.member(guildId, userId).set("warnCount", 2);

// Global scope: bot-wide add-on state
await services.data?.global().set("maintenance", false);

// Deleting keys:
await services.data?.guild(guildId).delete("welcomeMessage");
```

## Developer Experience & Tooling

Lumi provides 1-command CLI tools to make building and testing add-ons faster and safer than Redbot:

### 1. Scaffolding a New Add-on
Generate a full production-ready, typed add-on directory with compliant `manifest.json`, `index.ts` (with `defineModule`, slash commands, event listeners), and unit tests:
```bash
bun run addon:create my-addon --category Community
```

### 2. Local Symlink Linking & Unlinking
Link external/local add-on development checkouts directly into `data/addons/` without copying files or committing early:
```bash
bun run addon:link /path/to/my-addon
# Automatically resolves manifest.requirements with bun add --no-save

bun run addon:unlink my-addon
```

### 3. Static Add-on Linter & Security Validator
Validate manifests, check entry default exports, enforce relative imports and package boundaries without running the bot:
```bash
bun run addon:validate data/addons/my-addon
bun run addon:validate --all
```

### 4. Discord Live Hot-Reloading
Reload any add-on or bundled module instantly in Discord without restarting the process or dropping gateway connections:
```
/owner reload module:<name>
```
Supports autocomplete on all currently loaded modules and add-ons.

## Local development

```bash
# 1. Link the add-on into the loader root
bun run addon:link ../my-addon

# 2. If the bot is already running, reload live in Discord:
# /owner reload module:my-addon

# 3. Or launch the development bot:
bun run dev:bot
```

A linked directory has no `DownloaderModule` row, so it is loaded but not listed
under Add-ons → Installed. It never appears in the Modules tab.

## Publishing

1. Put each add-on in its own top-level directory in the repository.
2. Push the repository over HTTPS.
3. In Discord: `/lumi` → Add-ons → Repositories → Add Repository.
4. Open the repository, browse modules, and install.

Each installed module records the repository commit. `Pin` excludes it from
updates; `Update` fetches the branch and reloads changed modules. A failed
validation or reload rolls the update back and reports the error to bot owners.

## Checklist

- [ ] `manifest.json` name matches the directory
- [ ] The entry file exists and default-exports `defineModule(...)`
- [ ] Names are unique across bundled modules and installed add-ons
- [ ] No internal `@lumi/*` imports
- [ ] npm dependencies are declared in `manifest.requirements`
- [ ] Commands and listeners check `services.modules.isEnabled(guildId, name)`
- [ ] Config fields are declared in the manifest's `configFields`
