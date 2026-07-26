# Handoff Report: AGENTS.md & AI Guidelines Audit

**Agent Role**: Documentation Explorer 2 (AGENTS.md & AI Guidelines Audit)  
**Target File**: `/home/rebiz/opt/lumi/AGENTS.md`  
**Analysis Report**: `/home/rebiz/opt/lumi/.agents/teamwork_preview_explorer_m1_2/analysis.md`  
**Date**: 2026-07-26  

---

## 1. Observation

Direct observations made during inspection of `/home/rebiz/opt/lumi/AGENTS.md`, `package.json`, `CONTRIBUTING.md`, `scripts/`, `packages/`, and `.agents/`:

1. **`AGENTS.md` File Scope & Content**:
   - Path: `/home/rebiz/opt/lumi/AGENTS.md` (175 lines, 8,158 bytes).
   - Covers: Tech Stack, Project Architecture (Monorepo, `#lib/*` aliases, `LUMI_ROLE`), Module System (`@DefineModule`, sub-stores, zero cross-module import law), Data & State (`container.db`, Redis keys, Shapeshift config), Background Work (BullMQ, RabbitMQ), Observability (Pino, Tracing, Metrics), Development Standards (Card system, pagination, i18n), and Library Reference (`@discordjs/formatters`, `@sapphire/utilities`).
   - Omissions: Contains zero instructions regarding AI agent execution lifecycle, context window/token management, tool usage hierarchy, tool safety constraints, multi-agent handoff standards, state recovery (`progress.md`/`BRIEFING.md`), or verification execution order.

2. **Root `package.json` Discrepancies & Scripts**:
   - Lines 10–29: `imports` map includes `#database/*.js`, `#utilities/*.js`, `#core/*.js`, `#root/*.js`, `#modules/*.js`, and a `comment:imports` stating:
     > `"Safety net for downloaded addons: they are symlinked into packages/core/src/modules but live (realpath) under data/3rd-party-modules, so their #core/#lib/#utilities specifiers resolve up to THIS root package.json."`
   - Lines 30–46: Defines build & verification scripts:
     - `dev`: `turbo run dev`
     - `typecheck`: `turbo run typecheck:all` (`tsc --noEmit -p tsconfig.json`)
     - `lint`: `turbo run lint:all` (`eslint packages/*/src apps/*/src --fix`)
     - `db:generate`: `prisma generate`
     - `modules:manifest`: `bun scripts/generate-manifests.ts`
     - `validate`: `bun scripts/validate-addon.ts`
     - `test`: `vitest run`
     - `test:e2e`: `vitest run -c vitest.e2e.config.ts`
     - `verify:resilience`: `bun scripts/verify-resilience.ts`

3. **`CONTRIBUTING.md` & `scripts/README.md` References**:
   - `CONTRIBUTING.md` (lines 33–37, 66–81) notes `bun run db:generate` as a prerequisite before running `typecheck` or `test`, and `bun run modules:manifest` when adding new modules.
   - `scripts/README.md` details `generate-manifests.ts`, `validate-addon.ts`, `test-remote-addons.ts`, and `verify-resilience.ts`.

4. **Multi-Agent Workspace Structure**:
   - Multi-agent orchestration structure in `.agents/` relies on per-agent working directories (`.agents/<agent_name>/`), `BRIEFING.md` persistent memory, `progress.md` liveness tracking, and 5-component handoff reports (`handoff.md`). None of these multi-agent protocols are documented in `AGENTS.md`.

---

## 2. Logic Chain

1. **Premise 1**: `AGENTS.md` is titled *"Lumi-TS Architecture & Guidelines"* and states (line 4): *"This document serves as the absolute source of truth for developing the Lumi-TS codebase. AI coding assistants (like Claude) and human developers must adhere to these guidelines without exception."*
2. **Premise 2**: AI coding agents operating autonomously in monorepo environments require strict operational protocol guidelines (task execution lifecycle, token/context efficiency, tool search priority, safety constraints, multi-agent handoffs, and state recovery) to prevent context pollution, invalid file modifications, dangerous command executions, or broken builds.
3. **Deduction 1**: Because `AGENTS.md` currently focuses only on static TypeScript coding rules and omits operational agent protocols, AI agents lack governing rules for context limits, search priority, tool safety, handoffs, and progress tracking.
4. **Premise 3**: TypeScript typechecking in this monorepo relies on Prisma generated types (`packages/core/src/...`), and module discovery relies on generated manifest files (`scripts/generate-manifests.ts`).
5. **Deduction 2**: Omitting `bun run db:generate` and `bun run modules:manifest` from `AGENTS.md` will lead AI agents to encounter ungenerated Prisma type errors or unmanifested module registration failures during self-verification.
6. **Premise 4**: Addons live under `data/3rd-party-modules` and are symlinked into `packages/core/src/modules`, resolving path aliases via root `package.json`.
7. **Deduction 3**: Omitting this architecture from `AGENTS.md` leaves agents unaware of how 3rd-party addons integrate and resolve `#lib/*` and `#utilities/*` imports.
8. **Conclusion**: `AGENTS.md` requires a comprehensive overhaul to incorporate 6 AI Operational Pillars (Lifecycle, Context, Safety, Handoffs, Heartbeat, Verification Matrix) and architectural additions (Addon symlinking, Prisma/Manifest generation prerequisites) to become a top-tier open-source AI Agent Operating Specification.

---

## 3. Caveats

- **Scope Limitation**: Read-only exploration. No source code files outside of `.agents/teamwork_preview_explorer_m1_2/` were modified.
- **Assumptions**: Assumed Bun 1.3+ and local Docker services (PostgreSQL, Redis, RabbitMQ) are used for running full E2E and resilience suites.
- **Alternative Interpretations**: `AGENTS.md` could theoretically remain purely a code style guide while AI operational rules live in system prompts; however, consolidating both into `AGENTS.md` ensures single-source-of-truth compliance across all LLM IDE interfaces (Cursor, Antigravity, Copilot, Claude CLI).

---

## 4. Conclusion

Existing `AGENTS.md` is strong in code-level Sapphire/TypeScript conventions but incomplete as an AI Agent Operating Guide. The recommended restructuring outlined in `analysis.md` will transform `AGENTS.md` into an industry-leading specification covering AI task execution lifecycles, context & search efficiency, tool safety constraints, multi-agent handoff standards, state recovery, and a complete Verification Command Matrix.

---

## 5. Verification Method

To independently verify the observations and analysis in this report:

1. **Inspect `AGENTS.md`**:
   - Command: `view_file` on `/home/rebiz/opt/lumi/AGENTS.md`.
   - Confirm lack of agent operational protocols, context rules, tool safety constraints, handoffs, or verification matrices.
2. **Inspect Root `package.json` & `scripts/`**:
   - Command: `view_file` on `/home/rebiz/opt/lumi/package.json` (lines 10–46) and `/home/rebiz/opt/lumi/scripts/README.md`.
   - Confirm presence of `imports` map `#database/*`, `#utilities/*`, `data/3rd-party-modules` symlink comment, and validation scripts (`db:generate`, `modules:manifest`, `validate`, `verify:resilience`).
3. **Review Audit Report**:
   - Read `/home/rebiz/opt/lumi/.agents/teamwork_preview_explorer_m1_2/analysis.md` for full gap matrix and proposed 9-section restructuring blueprint.
