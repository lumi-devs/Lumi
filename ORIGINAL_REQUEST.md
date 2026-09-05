# Original User Request

## Initial Request — 2026-09-04T07:23:25Z

Refactor and harden the Lumi monorepo to achieve a 10/10 Code Hygiene & TypeScript standard. Re-enable all suppressed type-checked lint rules, eliminate loose and unsafe `any` usages across the codebase, and verify complete type safety and test stability across the entire monorepo.

Working directory: /home/rebiz/opt/lumi
Integrity mode: development

## Requirements

### R1. Re-enable Strict Type-Checked Lint Rules
Remove the suppressions in `packages/eslint-config/index.js` that turn off `@typescript-eslint/recommendedTypeChecked` safety rules. Specifically re-enable:
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-return`
- `@typescript-eslint/no-unsafe-argument`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-misused-promises`
- `@typescript-eslint/await-thenable`
- `@typescript-eslint/switch-exhaustiveness-check`
- `@typescript-eslint/no-unused-vars`

### R2. Monorepo-Wide Type Resolution & Narrowing
Resolve all type errors and unsafe accesses surfaced by the strict rules across `packages/*` and `apps/*`. Replace all `any` and unsafe assertions with:
- Concrete schema-backed types or contracts from `@lumi/contracts`
- Properly constrained generics and Discriminated Unions
- Type narrowing functions and Zod runtime parsers
- Do not introduce `@ts-ignore`, `@ts-nocheck`, or blanket eslint-disable comments to bypass checks.

### R3. Test Stability and Zero Regressions
Ensure all domain boundaries and existing functionality remain intact without breaking behavioral changes. All existing test suites across the monorepo must continue to pass cleanly.

## Acceptance Criteria

### Typecheck & Lint Verification
- [ ] `bun run typecheck` (including `turbo run typecheck:all`, dashboard, and docs) executes with zero type errors.
- [ ] `bun run lint:all` executes cleanly with zero errors and zero warnings across all workspace packages and apps.
- [ ] `packages/eslint-config/index.js` has all `@typescript-eslint/no-unsafe-*` and `@typescript-eslint/no-explicit-any` suppressions permanently removed.
- [ ] No new `@ts-ignore` or `@ts-nocheck` comments are added anywhere in `packages/` or `apps/`.

### Test & Regression Verification
- [ ] `bun run test` passes 100% of existing tests across `packages/core` and `apps/dashboard` with zero failures.
