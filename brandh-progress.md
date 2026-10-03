# Architecture Refactoring Progress - BrandH

## Task 1: Extract application layer from @lumi/core - CURRENT

### Completed actions:

- ✅ Created worktree branch `brandh` from origin/main
- ✅ Started architectural refactoring tracking document
- ✅ Removed `dashboard/rpc.ts` from modules (belongs in dedicated API layer)
- 🔄 In progress: begin extraction of application services from @lumi/core

### Next steps for Task 1:

1. **Create `packages/application/` package**
   - Move application services (persisters, repositories, business logic) out of `@lumi/core`
   - Remove mechanism: moving service classes from `packages/core/src/modules/*/services/` to `packages/application/services/*`

2. **Update `packages/core/package.json` dependencies**
   - Remove: `@sapphire/framework`, `discord.js`, `@discordjs/*` from direct dependencies
   - Keep: shell services, helpers, but not application logic

3. **Create `apps/api/package.json` independence**
   - Remove `@lumi/core` and add `@lumi/api` with clean dependency tree
   - API should only depend on `@lumi/contracts`, `@lumi/observability`, minimal infrastructure

4. **Create explicit application interfaces/ports**
   - Define interfaces for: GuildRepository, Cache, EventPublisher, JobQueue
   - Introduce dependency injection pattern

### Status: 🚧 In progress - next action needed

### Time tracking:
- Started: 2026-10-03
- Current phase: Extracting application layer