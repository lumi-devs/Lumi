# Add-on development guide

Add-ons are third-party supermodules. They follow the same module contract as
bundled modules, are installed from git repositories, and run in-process.

## Differences from bundled modules

| Aspect           | Bundled                  | Add-on                             |
| ---------------- | ------------------------ | ---------------------------------- |
| Location         | `modules/<supermodule>/` | `data/addons/<supermodule>/`       |
| Origin           | `bundled`                | `addon`                            |
| Install          | Deployed with the bot    | `/lumi` → Add-ons, bot owners only |
| Update           | Deploy the bot           | Repo update or auto-update         |
| npm dependencies | Root `package.json`      | `manifest.requirements`            |
| Trust            | Full                     | Static validation on install       |

## Structure

Every add-on is a supermodule: a directory with a root `manifest.json`, an
entry file, and one or more submodule directories.

```
my-addon/
├── manifest.json          # supermodule
├── index.ts               # supermodule definition (defineModule)
└── status/                # submodule: my-addon-status
    ├── manifest.json
    └── index.ts
```

The root module and each submodule use the same `defineModule` shape as bundled
modules. Submodule manifests use prefixed names (for example `my-addon-status`)
and declare `dependencies: { "my-addon": "^1.0.0" }`.

## Manifest

```json
{
  "apiVersion": 2,
  "name": "my-addon",
  "displayName": "My Add-on",
  "emoji": "🔌",
  "description": "What the add-on does",
  "version": "1.0.0",
  "entry": "index.ts",
  "dependencies": {},
  "requirements": ["lodash@^4.17.21"],
  "conflicts": [],
  "configFields": []
}
```

- `entry` is loaded directly by Bun; ship TypeScript, not compiled JS.
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
- A missing entry file or invalid requirement spec

Allowed runtime imports:

- `discord.js`, `@discordjs/builders`, `@discordjs/formatters`, `zod`
- `@lumi/module-kit`, `@lumi/ui`, `@lumi/foundation`
- `node:*`, `bun`, `bun:*`
- Anything declared in `requirements`

## Services

Add-ons receive the same `services` object as bundled modules, including
`client`, `redis`, `db` (`{ prisma, permits }`), `prisma`, `permits`, `config`,
`configService`, `modules`, `moduleLoader`, `moduleManager`, `scheduler`, `rpc`,
`ui`, `addons`, `discord`, and `observability` (`{ healthMonitor, logger }`).
Treat the database as shared: prefix tables with your add-on name.

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

A linked directory has no `DownloaderModule` row, so it appears in the Modules
tab but not under Add-ons → Installed.

## Publishing

1. Put the supermodule at the repository root (or in a top-level directory).
2. Push the repository over HTTPS.
3. In Discord: `/lumi` → Add-ons → Repositories → Add Repository.
4. Open the repository, browse modules, and install.

Each installed module records the repository commit. `Pin` excludes it from
updates; `Update` fetches the branch and reloads changed modules. A failed
validation or reload rolls the update back and reports the error to bot owners.

## Checklist

- [ ] Supermodule `manifest.json` name matches its directory; submodule names follow `<supermodule>-<directory>`
- [ ] Entry file exists and default-exports `defineModule(...)`
- [ ] Submodule names are prefixed and unique
- [ ] No internal `@lumi/*` imports
- [ ] npm dependencies are declared in `requirements`
- [ ] Commands and listeners check `services.modules.isEnabled(guildId, name)`
- [ ] Config fields are declared in the manifest's `configFields`
