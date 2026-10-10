# TypeScript style

## Lint config: what's actually on

Root `eslint.config.mjs` is self-contained (no shared package): `eslint.configs.recommended` +
`tseslint.configs.recommendedTypeChecked` with `parserOptions.project: true`, then a set of
type-checked rules turned back off (the `no-explicit-any` / `no-unsafe-*` /
`no-misused-promises` / `await-thenable` family and others — see the top of the
file). Don't add `any`, `@ts-ignore`, or `@ts-nocheck` just because those rules
are off; `strict`, `noUnusedLocals`/`noUnusedParameters` (`tsconfig.base.json:9,24-25`)
hold at the `tsc` level regardless.

Repo-specific rules that matter day to day:

- `no-restricted-imports` (`eslint.config.mjs:51`) blocking `**/modules/*/**`
  from outside a module and `EmbedBuilder` from `discord.js`/`@discordjs/builders`
  — the zero-cross-module-import law and the Components-v2-cards-only rule from
  `AGENTS.md`.
- A second `no-restricted-imports` (`eslint.config.mjs:92`) forbidding
  `@lumi/lib/permissions/permit-resolver.js` from `permissions/**`, `rpc/**`, and
  `addon-sandbox/**` — those ask `authorize()` instead.
- `no-restricted-syntax` scoped to `packages/core/src/**/commands/*.ts`
  (`eslint.config.mjs:126`) banning raw `interaction.reply/editReply/followUp`
  and `MessageFlags.Ephemeral` ORed into a reply — go through `ctx.reply*`.
- A third `no-restricted-imports` scoped to `packages/core/src/modules/*/**/*.ts`
  (`eslint.config.mjs:144`) permitting relative imports within a module's own
  folder but blocking sibling modules.

`tsconfig.base.json` is the shared base: `strict`, `noUncheckedIndexedAccess`,
`noImplicitOverride`, `verbatimModuleSyntax`, `experimentalDecorators`.
Path aliases all live in `tsconfig.base.json` paths (typecheck) and are honored
by Bun at runtime: `@lumi/lib/*.js` + `@lumi/modules/*.js` point into
`packages/core/src/`; `@lumi/*` cross-package aliases point at their owning
packages. No `"imports"` map anywhere in the tree. The dashboard (own repo) has its own tsconfig and
`typecheck` script.

## Comments: terse, functional, never AI-sounding

Standing rule, enforced in repeated cleanup commits: default to **no comment**.
Add one only for a genuine WHY — a gotcha, a constraint that would silently
break. Never restate the identifier. No emoji in comments or commit messages.
No section-marker comments (`// ---- Helpers ----`).

## Naming conventions

- **Modules/commands**: plain objects, camelCase + `Def`/`Module` suffix.
  `afkModule = defineModule({...})` (`packages/core/src/modules/afk/index.ts`),
  `sayDef: CommandDef` (`packages/core/src/modules/mod/commands/say.ts:7`),
  `kickDefFlow` (`kick.ts:21`). No `*Module`/`*Command` classes, no
  `@ApplyOptions`, no `@DefineModule` — the class API is removed (the addon
  validator errors on it).
- **Interfaces/type aliases**: PascalCase. `ModuleMeta`
  (`packages/core/src/lib/module-system/meta.ts:33`), `GuildMessage`
  (`packages/core/src/lib/types/common.ts:3`).
- **Functions/variables**: camelCase. `fetchTyped`
  (`packages/core/src/lib/i18n/index.ts:177`).
- **Exported `as const` object constants**: PascalCase, *not* SCREAMING_SNAKE_CASE
  (repo-wide rename, commit `028e57b`). `LumiEvents`
  (`packages/core/src/lib/types/common.ts:5`), `DefaultLanguage`
  (`packages/core/src/lib/i18n/index.ts:51`).
- **Environment variable identifiers stay SCREAMING_SNAKE_CASE** — they mirror
  real shell names (`process.env["BOT_TOKEN"]`, `.env.example`). There was a
  real regression where the PascalCase rename swept up `OWNER_IDS`; when
  renaming, check whether the string value is a real env var name first.
