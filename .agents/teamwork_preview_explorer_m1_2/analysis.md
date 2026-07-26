# Comprehensive Audit & Recommendations for AGENTS.md and AI Guidelines

**Target Document**: `/home/rebiz/opt/lumi/AGENTS.md`  
**Auditor**: Documentation Explorer 2 (AI Guidelines Audit)  
**Date**: 2026-07-26  
**Scope**: Full audit of existing agent guidelines, codebase architecture, AI workflows, context management, safety constraints, multi-agent handoff standards, state recovery, and verification rules across the Lumi repository.

---

## 1. Executive Summary

`AGENTS.md` serves as the primary technical specification for developers and AI agents working on the Lumi codebase. The current document (175 lines, ~8.1 KB) provides a solid foundation of project-specific TypeScript guidelines, Sapphire v5 architecture, path aliases, module system rules, and card system formatting.

However, when benchmarked against **top-tier industry standards for AI Agent Guidelines in open-source repositories** (such as Anthropic/OpenAI developer agent guidelines, GitHub Copilot workspace conventions, and multi-agent system specifications), the current `AGENTS.md` exhibits significant gaps:
1. **Focus Disparity**: It functions almost exclusively as a static TypeScript coding style guide rather than an **operational governing specification for AI agents**.
2. **Missing Operational Protocols**: It completely lacks instructions regarding AI agent lifecycle management, context window optimization, tool usage hierarchy, state recovery (`progress.md`/`BRIEFING.md`), multi-agent handoffs, and strict workspace boundary isolation.
3. **Missing Workflow Validation Steps**: It omits critical pre-typecheck build prerequisites (e.g., `prisma generate`) and module manifest generation (`bun run modules:manifest`), leading to potential agent hallucination or check failures.
4. **Architectural Omissions**: Key infrastructure details—such as how downloaded 3rd-party addons live in `data/3rd-party-modules` and symlink to `packages/core/src/modules` (using root `package.json` import mappings)—are missing.

This audit provides a complete breakdown of strengths, identified deficits, codebase inconsistencies, and a concrete blueprint for transforming `AGENTS.md` into an industry-leading master guideline document.

---

## 2. Audit of Existing AGENTS.md (Baseline Evaluation)

### 2.1 Current Content Map
The existing `AGENTS.md` is structured into 8 primary sections:

| Section | Content Overview | Strengths | Weaknesses / Omissions |
|---|---|---|---|
| **1. Tech Stack** | Bun, Sapphire v5, discord.js v14, Prisma + PostgreSQL, Redis, RabbitMQ, BullMQ, Shapeshift, Pino, i18next. | Explicit library listing and versions. | No command references for environment startup or validation. |
| **2. Architecture** | Monorepo layout (`packages/*`, `apps/*`, `@lumi/core`), core subdirs, path aliases (`#lib/*`, `#modules/*`), runtime roles (`LUMI_ROLE`). | Clear warning on cross-package imports (`@lumi/*`), import extensions (`.js` requirement). | Omits `data/3rd-party-modules` symlink resolution mechanism and root `package.json` import mappings. |
| **3. Module System** | `@DefineModule`, sub-store dirs (`commands/`, `listeners/`, `interaction-handlers/`, `services/`, `scheduled-tasks/`), zero cross-module import law. | Clear strict law against sibling module imports. | Missing requirement to execute `bun run modules:manifest` after module changes. |
| **4. Data & State** | `container.db` (DatabaseService), `RedisKeys`, `InvalidationBus`, Shapeshift config validation (`cfg.*`), `configChangeHooks`. | Strict rule against direct `container.prisma` usage in modules. | Missing database migration vs schema push rules for dev vs prod. |
| **5. Background Work** | Scheduled tasks (`RelayTask`), RabbitMQ events & RPC. | Explains distinction between BullMQ and RabbitMQ. | No examples or handler patterns. |
| **6. Observability** | Pino logger, Tracing (`startTracing`), Prom-client metrics on port 9090. | Explicit warning on `OTEL_ENABLED` vs `SENTRY_ENABLED` mutual exclusion. | No guidance on log level formatting or error handling standards. |
| **7. Development Standards** | `BaseCommand`, Card system helpers (`makeSuccessCard`, `makeErrorCard`), pagination (`chunk`). | Strict rule against raw embeds; enforced use of card utilities. | No code snippets illustrating exact command structure or decorator placement. |
| **8. Reference & Anti-Patterns** | Reference table for `@discordjs/formatters` and `@sapphire/utilities`; strict anti-patterns. | Excellent list of banned patterns (`.filter(Boolean)`, raw `<@id>`, `JSON.parse` in try/catch). | No agent operational anti-patterns (e.g. context blowing, unchecked git ops). |

---

## 3. Gap Analysis vs. Top-Tier AI Agent Guidelines

Top-tier open-source projects using AI coding agents adhere to six key operational pillars. The table below details how the current `AGENTS.md` fares against these pillars:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AGENTS.MD AUDIT SCORECARD                       │
├─────────────────────────────────────┬──────────────────┬───────────────┤
│ Operational Pillar                  │ Current Coverage │ Status        │
├─────────────────────────────────────┼──────────────────┼───────────────┤
│ 1. Agent Task Lifecycle Governance  │ 0%               │ ❌ MISSING    │
│ 2. Context Window & Tool Priority   │ 0%               │ ❌ MISSING    │
│ 3. Tool Execution & Safety Guards   │ 15%              │ ⚠️ WEAK       │
│ 4. Multi-Agent Handoff Standards    │ 0%               │ ❌ MISSING    │
│ 5. State Recovery & Liveness        │ 0%               │ ❌ MISSING    │
│ 6. Verification & Test Matrix       │ 20%              │ ⚠️ INCOMPLETE │
└─────────────────────────────────────┴──────────────────┴───────────────┘
```

### 3.1 Pillar 1: AI Agent Task Lifecycle & Workflow Governance
* **Current State**: Completely unaddressed. The document assumes a human reading a guide rather than an autonomous or semi-autonomous AI agent processing workspace requests.
* **Industry Standard**: AI guidelines must mandate a structured, phased approach to every task:
  1. **Phase 1: Exploration & Discovery (Read-Only)** — Read context files, grep code, locate exact lines, verify assumptions before writing.
  2. **Phase 2: Architectural Alignment** — Confirm package boundaries, module isolation, and schema contracts before editing.
  3. **Phase 3: Focused Implementation** — Make minimal, contiguous edits using diff tools. Do not alter unrelated formatting or files.
  4. **Phase 4: Mandatory Self-Verification** — Execute full verification suite (`typecheck`, `lint`, `test`).
  5. **Phase 5: Structured Handoff / PR Creation** — Document changes, observations, and verification commands.
* **Required Addition**: Section 1 of `AGENTS.md` should explicitly establish the **AI Agent Task Execution Lifecycle**.

### 3.2 Pillar 2: Context Limits, Token Efficiency & Search Protocol
* **Current State**: Absent. No rules for context management or tool choice.
* **Industry Standard**:
  - **Tool Hierarchy**: Agents must prioritize low-overhead tools: `grep_search` (exact pattern) -> `find_by_name` (filename search) -> `view_file` (targeted reading with `StartLine`/`EndLine`).
  - **Line & Slice Discipline**: Prohibit dumping large files into context (limit views to 800 lines max or specific line ranges).
  - **Diff Minimization**: Prohibit blanket auto-formatting or rewrite-the-world changes that obscure git diffs and consume massive context windows.
* **Required Addition**: Section on **Context Window & Information Retrieval Rules**.

### 3.3 Pillar 3: Tool Usage, Execution & Safety Constraints
* **Current State**: `AGENTS.md` lists code anti-patterns, but zero tool execution anti-patterns or safety constraints.
* **Industry Standard**:
  - **Forbidden Commands**: Strict ban on destructive filesystem operations (`rm -rf /`, force-deleting `.git`), environment leakages (printing `.env` secrets or logging API keys), and non-isolated production database operations (`prisma db push` in production; dev only).
  - **Prerequisites & Tool Execution Rules**: Explicit order of execution for commands (e.g. `prisma generate` must run prior to `typecheck`).
* **Required Addition**: Section on **Tool Safety Constraints & Execution Rules**.

### 3.4 Pillar 4: Multi-Agent Handoff & Collaboration Protocols
* **Current State**: Absent.
* **Industry Standard**: In multi-agent monorepo environments (Orchestrators, Explorers, Workers, Reviewers, Auditors), guidelines must mandate a standardized 5-Component Handoff Protocol:
  1. **Observation**: Verbatim file paths, line numbers, exact errors, tool output quotes.
  2. **Logic Chain**: Step-by-step reasoning connecting observations to conclusions.
  3. **Caveats**: Scope limits, unverified edge cases, assumptions.
  4. **Conclusion**: Clear, actionable summary supported by logic.
  5. **Verification Method**: Exact commands and file paths to independently verify findings.
* **Workspace Boundary Rule**: Agents write exclusively to their assigned folder in `.agents/<agent_id>/` and never pollute root directories with temporary scratch files.
* **Required Addition**: Section on **Multi-Agent Governance & Handoff Protocols**.

### 3.5 Pillar 5: State Recovery & Liveness Heartbeats
* **Current State**: Absent.
* **Industry Standard**:
  - **Liveness Heartbeat**: Maintain a `progress.md` file updated after every major execution step with a `Last visited: [timestamp]` ISO header.
  - **Persistent Working Memory**: Maintain `BRIEFING.md` (<100 lines index) with immutable `## 🔒 My Identity` and `## 🔒 Key Constraints` sections to survive context window resets.
* **Required Addition**: Section on **State Recovery & Liveness Protocol**.

### 3.6 Pillar 6: Comprehensive Verification & Test Matrix
* **Current State**: `AGENTS.md` mentions none of the test or validation scripts. `CONTRIBUTING.md` lists commands, but uses `nix-shell -p bun nodejs --run "..."` wrappers which are verbose and inconsistent with native `bun run` scripts in `package.json`.
* **Industry Standard**: Provide a unified, tabular **Verification Matrix** mapping change scopes to exact validation commands:

```
┌─────────────────────────────┬─────────────────────────────────────────────────┐
│ Change Scope                │ Required Verification Command(s)                │
├─────────────────────────────┼─────────────────────────────────────────────────┤
│ Core / Package TypeScript   │ bun run db:generate && bun run typecheck        │
│ Formatting & Style          │ bun run lint                                    │
│ Unit & Integration Tests    │ bun run test                                    │
│ Module Manifest / Config    │ bun run modules:manifest                        │
│ Addon Validation            │ bun run validate <path/to/addon>                │
│ End-to-End Functionality    │ bun run test:e2e                                │
│ System Resilience           │ bun run verify:resilience                       │
└─────────────────────────────┴─────────────────────────────────────────────────┘
```

---

## 4. Codebase & Architectural Inconsistencies Discovered

During investigation of `package.json`, `scripts/`, `CONTRIBUTING.md`, `packages/`, and `apps/`, the following discrepancies between current documentation and code were identified:

1. **Prisma Generation Prerequisite Missing**:
   - `package.json` relies on `@prisma/client` generated types in `packages/core`. Running `bun run typecheck` on a fresh clone or after schema changes will fail unless `bun run db:generate` (`prisma generate`) is executed first. `AGENTS.md` makes zero mention of `bun run db:generate`.
2. **Module Manifest Generation Omitted**:
   - `scripts/generate-manifests.ts` generates static `manifest.json` files for `@DefineModule` metadata across all modules. `CONTRIBUTING.md` mentions `bun run modules:manifest`, but `AGENTS.md` (the primary developer/agent document) omits it entirely.
3. **Addon Directory Symlinking & Root Import Mapping Unexplained**:
   - `package.json` contains a `comment:imports` explaining that downloaded 3rd-party addons live under `data/3rd-party-modules` and are symlinked into `packages/core/src/modules`, relying on root `package.json` `#lib/*` and `#root/*` imports. `AGENTS.md` does not document this 3rd-party module structure or alias resolution mechanism.
4. **Nix-shell Wrapper Ambiguity**:
   - `CONTRIBUTING.md` mandates prefixing commands with `nix-shell -p bun nodejs --run ...`, whereas `AGENTS.md` and standard Bun workflows use native `bun run ...`. `AGENTS.md` should clarify that native `bun run` commands are standard inside configured container/agent environments.
5. **Path Alias Completeness**:
   - `AGENTS.md` lists `#lib/commands.js`, `#lib/env.js`, `#lib/permissions.js`, `#lib/rabbit.js`, `#lib/guild-transaction.js`, `#lib/module-check.js`, `#lib/types.js`, `#lib/module-system.js`, `#lib/schedule-task.js`, `#lib/scheduler-bus.js`.
   - However, `package.json` also defines `#database/*.js`, `#utilities/*.js`, `#core/lib/*.js`, `#core/module-system/*.js`, `#core/*.js`, `#root/*.js`, and `#modules/*.js`. `AGENTS.md` should list the complete alias set.

---

## 5. Recommended Blueprint & Restructuring Plan for AGENTS.md

To elevate `AGENTS.md` to top-tier open-source standards, we recommend restructuring `AGENTS.md` into 9 clear, logically ordered sections:

### Proposed Table of Contents for Revamped AGENTS.md:
1. **🤖 AI Agent Operational Protocols & Safety Guardrails**
   - Phased Task Lifecycle (Exploration -> Design -> Implementation -> Verification -> Handoff)
   - Context Window & Information Retrieval Optimization (`grep_search` priority, line slicing)
   - Tool Safety Constraints & Environment Rules (Forbidden commands, secret masking)
   - Multi-Agent Workspace Isolation & Handoff Standard (5-Component Report)
   - Liveness Heartbeat & State Recovery (`progress.md`, `BRIEFING.md`)
2. **🏗️ Monorepo Architecture & Path Resolution**
   - Workspace boundaries (`packages/*`, `apps/*`, `@lumi/core`)
   - Complete Path Alias Reference (`#lib/*`, `#database/*`, `#utilities/*`, `#modules/*`, `.js` extension law)
   - 3rd-Party Addon Architecture (`data/3rd-party-modules` & symlinks)
   - Runtime Roles (`LUMI_ROLE`: monolith, gateway, worker, scheduler)
3. **🛠️ Tech Stack & Library Reference**
   - Core libraries, Sapphire v5 ecosystem, Bun runtime specs
   - `@discordjs/formatters` & `@sapphire/utilities` lookup tables
   - Approved utilities (`@sapphire/fetch`, `@sapphire/stopwatch`, `humanizeDelta`)
4. **🧩 Module System & Component Laws**
   - Module directory structure (`index.ts`, `@DefineModule`, sub-stores)
   - Zero Cross-Module Import Law
   - Service instantiation & retrieval (`getService`)
   - Permissions hierarchy & builder conventions
   - Manifest generation requirement (`bun run modules:manifest`)
5. **💾 Data, State & Config Management**
   - `container.db` mandate (zero direct `container.prisma` in modules)
   - Redis key registry (`RedisKeys`) & `InvalidationBus`
   - Shapeshift schema validation (`cfg.*`) & config change hooks
6. **⚙️ Background Processing & Event Bus**
   - BullMQ scheduled tasks (`RelayTask` in `scheduled-tasks/`)
   - RabbitMQ event bus & RPC bridge
7. **📊 Observability & Metrics**
   - Pino logging conventions
   - Prom-client metrics registry rule (`packages/observability/src/metrics.ts`)
   - Mutual exclusion: `OTEL_ENABLED` vs `SENTRY_ENABLED`
8. **💻 UI Card System & i18n Rules**
   - Mandatory Card System utilities (`makeSuccessCard`, `makeErrorCard`, etc.)
   - Pagination with `chunk()`
   - Multilingual requirements (`en-US`, `de`, `es-ES`, `fr`)
9. **✅ Verification Matrix & Anti-Pattern Index**
   - Verification Command Matrix (Typecheck, Lint, Test, Manifest, Addon, Resilience)
   - Strict Anti-Patterns Table (Code anti-patterns & AI operational anti-patterns)

---

## 6. Conclusion & Roadmap

By expanding `AGENTS.md` from a static code style guide into a complete **AI Agent Operating Guide & Technical Specification**, the Lumi project will significantly reduce agent errors, prevent cross-package/cross-module boundary violations, streamline multi-agent collaboration, and ensure 100% test and type compliance across all PRs.

### Next Steps for Implementation Worker:
1. Integrate the 6 AI Operational Pillars (Lifecycle, Context, Safety, Handoffs, Heartbeat, Verification Matrix) into `AGENTS.md`.
2. Expand the Monorepo Architecture section to detail root `package.json` import mappings and `data/3rd-party-modules` addon symlinking.
3. Update path aliases to include `#database/*` and `#utilities/*`.
4. Include `bun run db:generate`, `bun run modules:manifest`, `bun run validate <path>`, and `bun run verify:resilience` in the Verification Command Matrix.
5. Preserve and highlight all existing strict coding rules (Card system, zero cross-module imports, `@sapphire/utilities` anti-patterns).
