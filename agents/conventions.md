# Conventions

## TypeScript

- ESM, `strict`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`.
- Use `.ts` extensions on relative imports.
- Import types with `import type`.
- No `any`. Use `unknown` and narrow.
- Prefer `readonly` on public data.
- Return explicit `Promise<T>` on public async methods.
- No classes for pure functions; no functions for stateful services.

## Errors

- Represent expected, user-facing failures as thrown `Error`s and reply with
  `commandErrorCard(error)` / `makeErrorCard(...)`; there is no `UserError` class.
- Convert Discord REST codes to friendly text in `src/core/errors.ts`.
- Log unexpected errors with structured context (`{ error, module, key }`).
- Never swallow an error silently. If a failure must not break the caller, catch,
  log, and continue with a comment only when the reason is non-obvious.
- Fire-and-forget is allowed only for metrics/telemetry, and must have `.catch`.

## Logging

`createLogger({ name })` from `@lumi/foundation`. Use structured fields:

```ts
logger.warn({ module: "afk", guildId }, "afk entry missing");
```

Message strings are constant; data goes in the object.

## Dependencies

- `devalue` for cache serialization.
- Small helpers (`cutText`, chunking, null filters) are written locally in the
  package that needs them rather than pulled from a utility package.
- Add-on installs use the system `git` CLI (`execFileSync`); do not vendor a git implementation.
- Do not add a dependency for a few lines.

## Security

- Validate at trust boundaries: addon paths, git revisions, repo URLs, manifest
  names, command input.
- Addons are in-process, not sandboxed. The admin-only install plus validation is
  the boundary.
- Never log tokens, decrypted secrets, or full config blobs.

## Cleanliness

- Delete dead code; no compatibility re-exports.
- One purpose per file.
- Comments explain _why_, never _what_.
