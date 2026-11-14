# Add-on development guide

Add-ons are third-party flat modules. They follow the same module contract as
bundled modules, are installed from git repositories, and run in-process.

## Differences from bundled modules

| Aspect           | Bundled               | Add-on                             |
| ---------------- | --------------------- | ---------------------------------- |
| Location         | `modules/<category>/<module>/` | `data/addons/<module>/`   |
| Origin           | `bundled`             | `addon`                            |
| Install          | Deployed with the bot | `/lumi` → Add-ons, bot owners only |
| Update           | Deploy the bot        | Repo update or auto-update         |
| npm dependencies | Root `package.json`   | `manifest.requirements`            |
| Trust            | Full                  | Static validation on install       |

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
(`{ healthMonitor, logger }`), `helpers`, and an optional `moduleName`.
Database and cache access goes through the `helpers` namespaces (`economy`,
`leveling`, `stats`, `tickets`, `roleMenus`, `customCommands`, `roles`,
`security`, `verification`, `utility`, `moduleData`, `cache`). `prisma`, `redis`, the raw cache
client, `moduleLoader`, `moduleManager`, `configService`, and `addons` are not
part of the add-on services contract. See
[services.md](./services.md).

## Local development

```bash
# 1. Link the add-on into the loader root
ln -s /path/to/my-addon data/addons/my-addon

# 2. Install npm requirements for local testing
cd data/addons/my-addon
bun add --production --ignore-scripts --no-save <requirements>

# 3. Restart the bot (or run an add-on update from the panel to reload)
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
