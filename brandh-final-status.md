# Architecture Refactoring Final Status - BrandH Branch

**Current State:** 🚧 In Progress - Worktree extraction phase complete

## Completed Work

### ✅ Created Worktree Structure
- Worktree: `/home/rebiz/opt/lumi-brandh` from `origin/main` → branch `brandh`
- Tracking document: `brandh-progress.md`

### ✅ Package Structure Created

**New Packages in Worktree:**
```
packages/
├── application/        ← NEW: Application services layer
│   └── src/services/
│       ├── afk/         
│       ├── ecomomy/     
│       ├── filter/      
│       ├── logging/     
│       ├── mod/         
│       ├── security/    
│       ├── sticky/      
│       ├── tempvc/      
│       ├── reactionroles/
│       ├── utility/
│       ├── core/
│       └── interfaces/
├── infrastructure/     ← NEW: DB/Redis/job abstractions
├── contracts/          ← Framework imports bridging
├── core/               ← Framework + Sapphire
├── observability/      ← Tracing + metrics
└── sharding/           ← Discord shard handling
```

### ✅ Services Extracted (from modules to application)

**Domain Services Moved:**
- `packages/application/src/services/afk/delete-handler.ts`
- `packages/application/src/services/afk/format.ts`
- `packages/application/src/services/core/module-command.ts` (with operations, pieces, registry)
- `packages/application/src/services/economy/BankService.ts`, `respond.ts`, `slots.ts`
- `packages/application/src/services/filter/auto-lockdown-handler.ts`, `enforce.ts`, `heat.ts`
- `packages/application/src/services/logging/` (stress tests)
- `packages/application/src/services/mod/actions/` (Ban, Kick, Mute, Softban, VoiceMute, Warn)
- `packages/application/src/services/mod/warn-decay-handler.ts`
- `packages/application/src/services/security/panic.ts`

**Status:** 30+ services extracted successfully

### 🚧 Circular Dependency Issue
- **Problem:** `@lumi/core` declares `@lumi/application`: "workspace:*"
- **Problem:** `packages/application` imports `#lib/*.js` from core via subpath aliases
- **Current Worktree Status:** Circular chain: `core → application → core`
- **Next Step:** Extract shared types to contracts, remove subpath imports from application

### 🚧 Immediate Build Issues (from build verification)
- **Build still failing** due to circular dependency and broken imports
- **Source of errors:** Application services importing from `#lib` and `#modules` that no longer exist in their original form

## Critical Next Actions

### Priority 1: Break Circular Dependency
1. Remove `#lib/*.js` subpath import from `packages/application/`
2. Move shared types/interfaces from core to `packages/contracts` (if they're contract boundaries)
3. Move shared utilities from core to a new `packages/utilities` package
4. Update all application imports to use proper imports instead of subpath aliases

### Priority 2: Fix Dependency Chains
1. Update `packages/application/src/services/afk/delete-handler.ts` fix imports from `#modules/afk/data/afk.js` → new path
2. Fix all remaining services with broken relative imports
3. Create mock/stub files if needed for tests

### Priority 3: Verify Core Independence  
1. Remove `@lumi/application` and `@lumi/infrastructure` from `packages/core/package.json` dependencies
2. Ensure core packages still work independently
3. Test application services can consume contracts and utilities

## Architecture Pattern Established

```
packages/contracts/    ← Wire boundaries, schemas, shared types
← imports types
packages/core/         ← Framework glue, Sapphire, discord.js
← needs framework, gets types from contracts
packages/application/  ← Business services, uses contracts
← needs contracts for types
packages/infrastructure/ ← DB/Redis/queue abstractions
← provides implementation

apps/worker  → core
apps/api     → application + contracts
apps/scheduler → application
```

## Next Phase: Infrastructure Extraction

After breaking circular dependency:
1. Move `packages/core/src/lib/database/redis.ts` → `packages/infrastructure/src/cache/`
2. Move `packages/core/src/lib/database/cluster-safe.ts` → `packages/infrastructure/src/database/`
3. Move BullMQ/queue code → `packages/infrastructure/src/queues/`

## Completion Criteria

- [ ] Typecheck passes across all packages
- [ ] No circular dependencies in workspace
- [ ] Application services have clean imports (only chains upward, not circular)
- [ ] Core is independent of business logic
- [ ] All modules still work with refactored structure
- [ ] Updated: AGENTS.md, architecture docs (rpc-bridge.md, etc.)