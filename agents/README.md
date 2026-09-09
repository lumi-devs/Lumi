# Agent reference

Deep-dive reference material for AI coding agents working in this repo.
`AGENTS.md` at the repo root is the map — read it first. This directory is the
"read more" tier: grounded in actual source (file:line references throughout),
not generic framework advice. If something here ever conflicts with the actual
code, the code wins — these files can drift, `AGENTS.md` and the source can't.

## Layout

- **`architecture/`** — how the big systems actually work: the module system
  (`@DefineModule`, lifecycle hooks, config schema), the addon SDK (what
  third-party code can and can't import), the RPC bridge (dashboard ↔ worker).
- **`conventions/`** — repo-wide standards: TypeScript/naming style, testing
  patterns, git/commit conventions, the i18n key-parity system.
- **`domains/`** — specific subsystems: database access patterns, the permit
  vocabulary, UI component builders, autocomplete wiring, and how dashboard
  pages derive their layout from module config schemas.
- **`workflows/`** — step-by-step recipes for common tasks: adding a module,
  a command, an RPC action, a dashboard page. Each one works through a real
  existing example rather than a hypothetical.

## When to read what

Starting a task that touches one of these areas? Read the relevant
`workflows/` file first — it links out to the `architecture/`/`domains/`/
`conventions/` background it actually needs, so you don't have to read
everything up front.

This is distinct from `apps/docs/`, which is the public, user-facing
documentation site (self-hosters and third-party addon authors) — that content
is written for humans running the bot, not for an agent editing its source.
