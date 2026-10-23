# Addon downloader

Package: `@lumi/downloader` (`packages/downloader`). Pure-JS git via
`isomorphic-git`; no `git` subprocess, no worktrees, no pins.

## Layout

```
data/repos/<repo>/                     bare-ish clone + working tree at HEAD
data/addons/<module> -> .versions/<module>/<sha>
data/addons/.versions/<module>/<sha>/  materialized addon at the installed commit
```

Installs read the commit tree through `isomorphic-git` and write only blobs to a
staging directory. Validation runs on the staged copy, then manifest
`requirements` are installed. The final step is an atomic symlink rename; a
failed install never replaces the running version. Old version directories are
pruned after the switch.

## Flow

### add repo

`addRepo(name, url, branch)`:

1. Validate name (`^[a-z][a-z0-9-]*$`), URL (HTTP(S); no local paths or SSH),
   and branch.
2. Clone into `data/repos/.<name>.<uuid>.tmp`.
3. Rename to `data/repos/<name>`.
4. Upsert the DB record with the resolved HEAD.

If the directory exists with `.git` but the DB has no record, it is re-registered
instead of cloned again.

Private repositories use HTTPS basic auth from `GIT_TOKEN` (and optional
`GIT_USERNAME`, default `x-access-token`). SSH transports are not supported by
`isomorphic-git`; do not accept SSH URLs.

### update repo

`updateRepo(name)`:

1. `fetch` from origin, resolve the new commit.
2. If unchanged, return.
3. Materialize every installed module from this repo at the new commit into a
   staging root and validate it.
4. Only after all modules validate, reinstall each module at the new commit
   (each install stages and validates again), then `checkout` and update the DB
   record last.

A validation failure leaves the old commit checked out and installed.

### install

`install(repo, module, revision?)`:

1. Resolve the commit (HEAD or an explicit revision).
2. Refuse if the module is installed from a different repo.
3. Materialize `<repo>/<module>` at that commit into
   `.versions/<module>/.staging-<uuid>/<module>`.
4. `validateAddon()` on the staged directory.
5. Install the addon's `manifest.requirements` with Bun
   (`--production --ignore-scripts --no-save`) into the staged directory.
   Host-provided runtime packages are not reinstalled.
6. Move the staged directory to `.versions/<module>/<sha>`.
7. Atomically switch `data/addons/<module>` to the new version.
8. Record the install and call `onInstalled`.

### uninstall

Calls `onRemoved` (loader unload), removes the symlink and version directory, and
deletes the DB row.

### remove repo

Refuses while any installed module still belongs to that repo.

## Validation

`validateAddon()`:

- manifest exists and parses
- directory name matches `manifest.name`
- entry exists and stays inside the addon
- imports are scanned with `Bun.Transpiler.scanImports`
- relative imports cannot escape the addon
- `@lumi/db`, `@lumi/cache`, `@lumi/redis`, `@lumi/modules`, `@lumi/downloader`,
  `node:*`, `bun`, and `bun:*` are rejected
- bare imports must be part of the runtime surface or declared in
  `manifest.json` `requirements`
- requirement specs must be registry semver ranges; `file:`, git, URL, workspace,
  and `@lumi/*` internals are rejected
- a `package.json` with dependency sections is rejected; manifest is the only
  source of npm dependencies
- a vendored `node_modules` is rejected; dependencies are installed from
  `requirements`
- `bunfig.toml` and `.npmrc` are rejected so the addon cannot redirect the
  registry
- warnings for `new Client()`, `new EmbedBuilder()`, and direct `process.env`

The allowed bare packages are installed as root dependencies so addons resolve
them from `data/addons`. Do not expose `@lumi/db`, `@lumi/cache`, `@lumi/redis`,
`@lumi/modules`, or `@lumi/downloader` at the root.

Addons run in-process with the bot's permissions. Validation and admin-only
install are the trust boundary. Do not describe addons as sandboxed.

## Rules

- Never shell out to `git`.
- Never copy a working tree into `data/addons`; materialize the commit tree.
- Never install over an existing version directory without staging first.
- Keep the symlink switch as the last step.
- Every filesystem path derived from user input must be validated and checked
  against its root.
