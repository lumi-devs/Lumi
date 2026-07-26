## 2026-07-26T14:23:41Z

<USER_REQUEST>
Your working directory is: /home/rebiz/opt/lumi/.agents/teamwork_preview_worker_m1
Your role: Documentation Implementation Worker - Milestone 1 (README.md & AGENTS.md)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task Objective:
Regenerate `/home/rebiz/opt/lumi/README.md` and `/home/rebiz/opt/lumi/AGENTS.md` to top-tier open-source industry standards based on the findings from Explorer 1 (`/home/rebiz/opt/lumi/.agents/teamwork_preview_explorer_m1_1/analysis.md`) and Explorer 2 (`/home/rebiz/opt/lumi/.agents/teamwork_preview_explorer_m1_2/analysis.md`).

Instructions & Requirements:
1. Create your working directory `/home/rebiz/opt/lumi/.agents/teamwork_preview_worker_m1` and set up BRIEFING.md and progress.md.
2. Read the analysis reports:
   - `/home/rebiz/opt/lumi/.agents/teamwork_preview_explorer_m1_1/analysis.md`
   - `/home/rebiz/opt/lumi/.agents/teamwork_preview_explorer_m1_2/analysis.md`
3. Regenerate `/home/rebiz/opt/lumi/README.md`:
   - Include clear visual hierarchy, badges, quickstart, and concise professional copy.
   - Include clean Feature Matrix covering all 8 built-in modules (`afk`, `core`, `dashboard`, `filter`, `logging`, `mod`, `tempvc`, `utility`).
   - Include Architecture Overview with Mermaid/ASCII system topology diagrams showing entrypoint apps (`@lumi/worker`, `@lumi/gateway`, `@lumi/scheduler`, `@lumi/dashboard`), packages, event bus, and database backplanes.
   - Include Development & Setup Commands (`Makefile` targets `make setup`, `make dev`, Docker Compose profiles `scale`, `dashboard`, `observability`, `development`, Bun CLI scripts).
   - Include Configuration References (`config/bot.json`, `config/emojis.json`, `.env.example` matrix) and Kubernetes deployment specs overview (`deploy/k8s`).
4. Regenerate `/home/rebiz/opt/lumi/AGENTS.md`:
   - Structure as an industry-leading AI Agent Operating Specification.
   - Cover 6 AI Operational Pillars: Task Execution Lifecycle, Context Window & Information Retrieval Rules, Tool Execution & Safety Constraints (forbidden destructive bash commands, secret masking), Multi-Agent Workspace Isolation & 5-Component Handoff Protocol, State Recovery & Liveness (`progress.md`/`BRIEFING.md`), and Verification Command Matrix (`bun run db:generate`, `bun run modules:manifest`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run validate`).
   - Include Monorepo Architecture & Coding Standards: Sapphire framework conventions, `@DefineModule` decorator rules, sub-stores, zero cross-module import law, `container.db`, Redis key namespacing, BullMQ/RabbitMQ, Pino logging, and 3rd-party addon symlink resolution (`data/3rd-party-modules` -> `packages/core/src/modules`).
5. Run build/typecheck/lint commands (e.g. `bun run typecheck`, `bun run lint`) to ensure no errors were introduced in the workspace.
6. Write your handoff report in `/home/rebiz/opt/lumi/.agents/teamwork_preview_worker_m1/handoff.md` and send a completion message back to the parent orchestrator (conversation ID: db8776ea-2ec4-4b51-bbe3-2fbdf688ac7f).
</USER_REQUEST>
