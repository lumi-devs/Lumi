# TypeScript style

## Lint config: what's actually on

Shared config lives in `packages/eslint-config/index.js` and is consumed by every
workspace package's own `eslint.config.mjs` (root `eslint.config.mjs:3` imports it as
`baseConfig`, then layers repo-specific rules on top). It starts from
`eslint.configs.recommended` + `tseslint.configs.recommendedTypeChecked` (full
type-aware linting, `parserOptions.project: true`), then turns a specific set of
type-checked rules back off:

```js
'@typescript-eslint/no-extraneous-class': 'off',
'@typescript-eslint/switch-exhaustiveness-check': 'off',
'@typescript-eslint/no-explicit-any': 'off',
'@typescript-eslint/no-unsafe-assignment': 'off',
'@typescript-eslint/no-unsafe-member-access': 'off',
'@typescript-eslint/no-unsafe-return': 'off',
'@typescript-eslint/no-unsafe-argument': 'off',
'@typescript-eslint/no-unsafe-call': 'off',
'@typescript-eslint/restrict-template-expressions': 'off',
'@typescript-eslint/unbound-method': 'off',
'@typescript-eslint/no-unused-vars': 'off',
'@typescript-eslint/no-require-imports': 'off',
'@typescript-eslint/no-unsafe-enum-comparison': 'off',
'no-constant-binary-expression': 'off',
'no-useless-escape': 'off',
'@typescript-eslint/no-namespace': 'off',
'@typescript-eslint/no-empty-object-type': 'off',
'@typescript-eslint/no-base-to-string': 'off',
'no-useless-assignment': 'off',
'preserve-caught-error': 'off',
'no-empty': 'off',
'@typescript-eslint/await-thenable': 'off',
'@typescript-eslint/prefer-promise-reject-errors': 'off',
'@typescript-eslint/no-misused-promises': 'off',
'@typescript-eslint/no-redundant-type-constituents': 'off'
```

A prior hardening effort set out to re-enable exactly this list —
`no-explicit-any`, the `no-unsafe-*` family, `no-misused-promises`,
`await-thenable`, `switch-exhaustiveness-check`, `no-unused-vars` — under a
"10/10 Code Hygiene" mandate. The suppressions above are still live, so treat
that effort as unresolved rather than as an implicit go-ahead to write unsafe
code because the linter won't catch it. Don't add `any`, `@ts-ignore`, or
`@ts-nocheck` just because the type-checked variants are currently off;
`noUnusedLocals`/`noUnusedParameters`/`strict` are all on at the `tsc` level
(`packages/typescript-config/base.json:8,23,24`) regardless of what ESLint enforces.

On top of the base config, the root `eslint.config.mjs` adds repo-specific rules
that matter more day to day than the type-checked ones above:

- `no-restricted-imports` blocking `**/modules/*/**` from outside a module and
  `EmbedBuilder` from `discord.js`/`@discordjs/builders` anywhere
  (`eslint.config.mjs:23-46`) — the zero-cross-module-import law and the
  Components-v2-cards-only rule from `AGENTS.md`, enforced at lint time, not just
  by convention.
- `no-restricted-syntax` scoped to `packages/core/src/**/commands/*.ts`
  (`eslint.config.mjs:62-79`) banning raw `interaction.reply(...)` and
  `MessageFlags.Ephemeral` ORed into a reply — must go through `ctx.reply*` /
  `replySuccess` etc.
- A second `no-restricted-imports` scoped to `packages/core/src/modules/*/**/*.ts`
  (`eslint.config.mjs:82-96`) that permits relative imports *within* a module's own
  folder but still blocks reaching into a sibling module.

`packages/typescript-config/base.json` is the shared `tsconfig` base: `strict: true`,
`noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`experimentalDecorators` + `emitDecoratorMetadata` (Sapphire's `@ApplyOptions`
decorators need these), `verbatimModuleSyntax`. The root `tsconfig.json` extends
`tsconfig.base.json`, which extends this and layers on the `#lib/*.js`-style path
aliases and `@lumi/*` package aliases. `apps/dashboard` has its own tsconfig (DOM
lib, JSX) — that's why `bun run typecheck` runs `turbo run typecheck:all` (root
`tsc --noEmit -p tsconfig.json`, which excludes the dashboard) and then a separate
`turbo run typecheck --filter=@lumi/dashboard`.

## Comments: terse, functional, never AI-sounding

This has come up enough times as its own cleanup commit that it's a standing rule,
not a preference:

```
89bb7c1 chore: strip redundant AI-style doc comments and dead deps
0e8ab76 chore: strip verbose explanatory comments added this session
f8f6d61 Merge pull request #74 from lumi-devs/chore/strip-ai-comments
129a86f chore(ci): ... drop AI filler comments
d1c1ccc chore(readme): remove extra explanatory comments from code snippets
32aac49 ci: clean up comments in all .github files
ab26b14 chore(k8s): remove excessive comments and rewrite README
8d3ebef chore: remove internal planning docs and tidy comments
acf6cc2 chore: trim redundant comments and dead code (post-release cleanup)
```

Default to **no comment**. Add one only when something is genuinely non-obvious —
a WHY a reviewer can't get from the code itself, a gotcha, a reference to the thing
that would silently break if this changed. Never restate what an identifier already
says. From the actual `89bb7c1` diff:

```diff
-/** Helper to send a standardized success card reply. */
 export const replySuccess = makeReplyHelper(makeSuccessCard);
-/** Helper to send a standardized error card reply. */
 export const replyError = makeReplyHelper(makeErrorCard);
```
(`packages/core/src/lib/commands.ts`) — deleted outright, because the name already
says exactly that.

```diff
-/**
- * Represents the static metadata structure exported by a feature module's index file.
- * This metadata is used during module discovery without executing the module's code.
- */
+/** Used during module discovery without executing the module's code. */
 export interface ModuleMeta {
```
(`packages/core/src/lib/module-system/Module.ts`) — kept, but cut down to the one
sentence that's actually load-bearing (the "without executing the module's code"
part explains a real constraint); the first sentence was pure restatement of the
type name and got deleted.

A good non-obvious comment already in the codebase, worth using as the template:
`packages/core/src/lib/i18n/index.ts:70-75` explains *why* `fetchLanguage` returns
`null` on no guild rather than throwing — that's a decision a reader would
otherwise have to reverse-engineer from the fallback chain.

No emoji in comments or commit messages. No comment that only exists to mark a
section (`// ---- Helpers ----`) — split the file or trust the reader instead.

## Naming conventions

- **Classes**: PascalCase, always. `AfkModule`
  (`packages/core/src/modules/afk/index.ts:62`), `FilterUtility`
  (`packages/core/src/modules/filter/utilities/FilterUtility.ts:65`),
  `KickCommand` (`packages/core/src/modules/mod/commands/kick.ts:28`).
- **Interfaces/type aliases**: PascalCase. `ModuleMeta`, `ModuleOptions`
  (`packages/core/src/lib/module-system/Module.ts:31,56`), `GuildMessage`
  (`packages/core/src/lib/types/common.ts:13`).
- **Functions/variables**: camelCase. `fetchTyped`
  (`packages/core/src/lib/commands.ts:118`), `sendReply`, `makeReplyHelper`
  (`packages/core/src/lib/commands.ts:48,57`).
- **Exported `as const` object constants**: PascalCase, *not* SCREAMING_SNAKE_CASE.
  This was an explicit, recent, repo-wide rename — see commit `028e57b refactor:
  rename exported SCREAMING_SNAKE constants to PascalCase`:

  ```diff
  -export const MANIFEST_FILE = "manifest.json";
  +export const ManifestFile = "manifest.json";
  ```
  (`packages/core/src/lib/module-system/manifest.ts`). The same commit touched
  `container-services.ts`, `resolver.ts`, `i18n/index.ts`, `PermitResolver.ts`,
  `PermissionRepository.ts`, `redis-lock.ts`, `regex-worker/validate.ts`,
  `rpc/validation.ts`, `scheduled-tasks.ts`, `types/common.ts`,
  `utilities/command-response.ts`, and every reference in `packages/core/tests` and
  `apps/dashboard/src`. Only the identifier changed — the underlying string values
  (Discord `custom_id`s etc.) were left untouched. `LumiEvents`
  (`packages/core/src/lib/types/common.ts:16`) and `DefaultLanguage`
  (`packages/core/src/lib/i18n/index.ts:40`) follow the same pattern. If you find
  a new `SCREAMING_SNAKE` export constant in this codebase that isn't a real
  environment variable name, that's the old convention — rename it.

- **Environment variable identifiers are the one exception, and stay
  SCREAMING_SNAKE_CASE**, because they're not really TypeScript identifiers — they
  mirror the actual shell env var name (`process.env["BOT_TOKEN"]`,
  `.env.example`, deploy configs, Nix). See the `Env` interface augmentation in
  `packages/core/src/lib/types/common.ts:86-124`: `BOT_TOKEN`, `POSTGRES_URL`,
  `REDIS_HOST`, `RPC_INTERNAL_TOKEN`, etc. `envParseString("BOT_TOKEN")`
  (`packages/core/src/lib/env.ts:288`) takes the literal env var name as its
  argument — that string has to match the real shell variable, so it can't be
  camelCased. This is the one place SCREAMING_SNAKE_CASE is correct; everywhere
  else (including constants that happen to hold config-ish values) it isn't. There
  was a real regression here — `f9d6b3f fix(core): restore the OWNER_IDS env var
  name` — where the PascalCase rename swept up an actual env var key and broke
  the setting nothing was reading anymore; the fix restored `OWNER_IDS` literally.
  When renaming constants, check whether the string value is a real env var name
  before touching it.

## Decorators and Sapphire conventions

`@ApplyOptions<T>({...})` (from `@sapphire/decorators`) is the standard way to
configure a Piece — see `packages/core/src/modules/mod/commands/kick.ts:18-27`.
`experimentalDecorators`/`emitDecoratorMetadata` in the shared tsconfig exist
specifically to support this pattern; don't disable them per-package.
