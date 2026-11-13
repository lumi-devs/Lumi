# Add-on downloader

Package: `@lumi/downloader` (`packages/downloader`). Tracks git repositories,
installs flat add-on modules into `data/addons/<module>`, and keeps them up to
date.

## Storage layout

| Path                          | Contents                                            |
| ----------------------------- | --------------------------------------------------- |
| `data/repos/<repo>`           | Shallow clone of a tracked repository               |
| `data/addons/<module>`        | Installed add-on (loaded by the module loader)      |
| `data/addon-backups/<module>` | Copy used to roll back a failed update              |

Repositories and installs are recorded in Prisma: `DownloaderRepo` and
`DownloaderModule`. `DownloaderModule.name` is the primary key, so an add-on can
be installed only once.

## Repository management

`AddonManager` (constructed in `src/index.ts`):

- `addRepo(name, url, branch)` — validates an HTTPS URL and a lowercase repo
  name (blank names are derived from the URL), shallow-clones into
  `data/repos/<name>`, records the HEAD commit.
- `removeRepo(name)` — refuses while add-ons from that repo are installed.
- `listRepoModules(name)` — reads each top-level directory with a manifest;
  one directory per add-on, manifest at its root.
- `updateRepo(name)` — fetches the branch, checks out the new HEAD, validates
  every installed module, applies the update, and rolls back on failure.

Git access uses the system `git` CLI (`execFileSync`) over HTTPS. Private
repositories authenticate with `GIT_TOKEN` (`GIT_USERNAME` defaults to
`x-access-token`). Commit signatures are not verified.

## Install flow

`install(repoName, moduleName)`:

1. Read and validate `data/repos/<repo>/<module>`.
2. Refuse when the name belongs to a bundled module or another repository.
3. Refuse when `manifest.conflicts` overlaps an installed add-on.
4. Copy the add-on into `data/addons/<module>` (skipping `node_modules` and
   `.git`; symbolic links are rejected).
5. Re-run `validateAddon` on the staged copy before touching the live add-on.
6. Install `manifest.requirements` with
   `bun add --production --ignore-scripts --no-save`.
7. Insert the `DownloaderModule` row and mount the module through
   `AddonRuntime.mount`, which registers its commands and listeners immediately.

`uninstall(name)` unmounts the module, removes its directory and backups, and
deletes the row.

## Updates

`updateRepo` is all-or-nothing:

1. Fetch and compare the remote head with the recorded commit.
2. Check out the new head.
3. Validate every installed module from that repo (pinned modules are skipped).
4. Copy each module to its add-on directory, install requirements, update the
   row, and reload it through `AddonRuntime.reload`.
5. On any failure, restore every backed-up module, reload the restored copies,
   return the repo to the previous commit, and report the failure.

Auto-update state lives in Redis under `lumi:addons:autoupdate`
(`enabled`, `intervalMinutes`, `lastCheckedAt`). A scheduler job checks every
minute and runs `autoUpdate()` once the interval has elapsed. Successful and
failed runs are reported to bot owners through `AddonManagerOptions.notify`.

## Validation

`validateAddon(dir)`:

- Parses `manifest.json` with `validateManifest` and requires `name` to match
  the directory (or an explicit `expectedName` when validating a staged copy).
- Requires `entry`; it must be a relative, existing JavaScript/TypeScript file
  inside the add-on directory.
- Accepts an optional `category` (1–32 characters) used only for UI grouping.
- Requires every `requirements` entry to be a registry package spec; path-like
  specs, local paths, URLs, and git specs are rejected.
- Rejects vendored `node_modules`, `.npmrc`, and `bunfig.toml`.
- Rejects symbolic links, hard links, and other non-regular files anywhere in
  the add-on.
- Scans every JavaScript/TypeScript file with `Bun.Transpiler.scanImports`:
  - relative imports must stay inside the add-on;
  - `node:*`, `bun`, and `bun:*` are allowed;
  - internal `@lumi/*` packages are rejected;
  - other bare imports must be a host runtime package (`discord.js`,
    `@discordjs/builders`, `@discordjs/formatters`, `zod`, `@lumi/module-kit`,
    `@lumi/ui`, `@lumi/foundation`) or be listed in `requirements`;
  - computed `import()`/`require()` specifiers and `import.meta.require` are
    rejected.

Storage paths for repos, add-ons, and backups only accept names matching
`^[a-z][a-z0-9-]*$`; repository URLs must be absolute `https:` URLs without
embedded credentials.

## Rules

- Add-ons are not sandboxed. They run in-process with the bot's permissions.
- Only bot owners (`OWNER_IDS`) can manage repositories and installs.
- Git repositories only; no npm or local sources.
- Keep `manifest.json` the only source of add-on metadata.
- Never write outside `data/repos`, `data/addons`, and `data/addon-backups`.
