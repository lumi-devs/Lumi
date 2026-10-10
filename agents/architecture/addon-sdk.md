# Addon SDK

Third-party addons are downloaded git repos managed by the downloader
(`packages/core/src/lib/downloader/`), installed under `data/` and enabled per
guild. Their only supported import surface is the `lumi` package — never
`@lumi/lib/*`, `@lumi/modules/*`, `discord.js`, or `node:*` builtins. Enforced three
ways: static analysis at install time (`validate.ts`), capability-gated host
RPC at runtime (`host/capabilities.ts`), and the isolate itself (no fs/network/
process globals exist to abuse).

## Execution: V8 isolates, mandatory

Every addon is bundled (`Bun.build`, `isolate/isolate-build.ts`) and run in a V8
isolate inside a Node sidecar (`runtime/addon-isolate-runner.ts`, plain
`.ts` — image and dev Nodes run type-stripped TS natively), spawned by
`host/AddonHost` (`host/addon-host.ts`) over NDJSON stdio. There is no other execution mode. Invokes are
serialized per isolate (FIFO); the runner stamps the active invocation id
itself and ignores the isolate-sent one, so concurrent calls can never cross
scopes.

- The isolate contains the addon's code plus the pure SDK slice (card/component
  builders, config schema, branding, shared utils). Everything impure is a host
  RPC (`call()` in `sdk/rpc.ts`, injected transport — `setRpcTransport`).
- Per-isolate memory limit (`LUMI_ISOLATE_MEMORY_MB`, default 128) and
  invocation timeouts; a dead isolate exits and the host crash-loop guard
  (respawn once, then failed) applies.
- The sidecar inherits an allowlisted env only (`childEnv`, `host/addon-host.ts`).
  Secrets never cross.
- `Bun.spawn` IPC does not interoperate with Node children (framing mismatch,
  silent) — hence NDJSON over stdin/stdout. `jail.set` only accepts
  transferable values (no plain objects); async host calls go through a
  `Reference` + `.apply(..., { result: { promise: true, copy: true } })`,
  never `Callback` (its results are always copied, so promises can't cross).
- Node 22+ is required to run the sidecar (`LUMI_NODE_BIN` override). Docker
  images compile the `isolated-vm` binding in the deps stage.

## The `lumi` surface (root `package.json` exports)

`lumi`, `lumi/commands`, `lumi/config`, `lumi/discord`, `lumi/events`,
`lumi/interactions`, `lumi/kv`, `lumi/net`, `lumi/permissions`, `lumi/valkey`,
`lumi/scheduling`, `lumi/ui`, `lumi/utils` → `packages/core/src/lib/addon-sandbox/sdk/*.ts`.

`node_modules/lumi` inside each addon dir symlinks the repo root
(`ensureAddonLumiLink`, `host/sandbox-root.ts`), so the root exports map is the one
and only subpath table. Notable surface points:

- `lumi` — `defineModule`, `cfg`, `logger`, `setRpcTransport` (test seam for
  addon unit tests; see `confessions/lib/anon.test.ts` in `lumi-addons`).
- `lumi/commands` — `defineCommand`, `CommandContext` (all Discord access is
  `call()`-backed; `ctx.*` never touches discord.js).
- `lumi/ui` — pure builders only: `make*Card`, `noPingCard`, `actionRow`/
  `selectRow`/`modal`, colors (emoji are unicode literals at each use site;
  builders take `{ name }` component-emoji objects).
  Host-backed runtimes (`confirmPrompt`, `paginateList`, panel rows) are
  absent — no live interaction objects exist in an isolate. A test
  (`panels.test.ts`) locks this boundary: pure builders identical, runtimes
  undefined.
- `lumi/utils` — `randomHex`, `sha256Hex`, `sleep` (host CSPRNG/crypto/timers;
  the isolate has none of these globals), plus pure time/error helpers
  (`errorFrom`/`swallow` live in `@lumi/shared`).
- `lumi/net` — `fetchUrl`/`fetchText`/`fetchJson`, backed by SSRF-guarded
  `net.fetch` (http(s) only, DNS-resolved IP denylist per redirect hop, 10s
  timeout, 5MB cap, text or base64 by content type).
- `lumi/config`, `lumi/kv`, `lumi/valkey`, `lumi/scheduling`, `lumi/discord`,
  `lumi/events`, `lumi/interactions`, `lumi/permissions` — thin `call()`
  wrappers; check `sdk/*.ts` (each is one import deep).

Discord enums the bundle needs (`MessageFlags`, `ActivityType`) are repo-owned
copies in `@lumi/lib/discord/constants.js`, drift-tested against the installed
`discord.js` (`constants.test.ts`) — `discord.js` itself can never enter the
bundle (drags `@discordjs/ws` + node builtins). Same story for card colors
(`@lumi/lib/ui/palette.js`, operator overrides baked at build time).

## Capabilities (`host/capabilities.ts`, contracts `addon-sandbox.ts`)

Every host method declares one requirement; unknown methods deny by default
(`isMethodAllowed`). `discord[]` scopes map to Discord powers, `scheduling` /
`valkey` default off, `kv` defaults on, `network` (for `net.fetch`) defaults
off. `util.randomHex` / `util.sha256Hex` / `util.sleep`, `config.get`, `log`,
and read-only Discord getters require nothing. Manifests declare them under
`capabilities` (validated names only — unknown discord names are install
errors); interaction prefixes are constrained to `<addonName>:` (`ownPrefixes`).

## `validate.ts` — what actually gets flagged

Errors (block install): missing/invalid `info.json` (name format, non-empty
author, semver version, required `end_user_data_statement`, name-dirname
match, bot-version range), missing/invalid `manifest.json` (+ unknown
capability names), missing `index.ts` / no `defineModule` / no export, a
`tasks/` or `scheduled-tasks/` directory, `EmbedBuilder` usage, `container`
usage, removed class API (`@DefineModule`/`BaseCommand`/`Module`), sibling or
`#`-internal imports, escaping relative imports.

Warnings: hand-authored `configFields`, `stores.registerPath`, leak heuristics
(unstored timers, listener without cleanup, module-level `let`/unbounded
collections), and dangerous-import tripwires (`node:fs/net/http/...`,
`bun:ffi`, bare `fetch(`/`Bun.`/`Worker(`/`require(builtin)`) — warn-only by
design, since `import("node:"+"fs")` defeats static detection. `*.test.ts`
files are never scanned; neither are `node_modules`/`.git`/`dist`/`build`.

## Addon manifest format

`info.json` (required: name, author, description, version,
`end_user_data_statement`; optional `requirements` = npm packages installed via
`bun add --ignore-scripts` into the addon dir and bundled by `Bun.build`,
`min/max_bot_version`, tags), `manifest.json` (module metadata + `capabilities`;
synthesized at install if absent). Reference addons live in
[`lumi-devs/lumi-addons`](https://github.com/lumi-devs/lumi-addons).
