# Task 1: Extract application layer from @lumi/core - Detailed TODO

## Complete Breakdown

### Phase 1: Assessment
- [ ] Audit current @lumi/core dependencies in detail
- [ ] Identify which dependencies are actually framework-specific (Sapphire/Discord) vs reusable
- [ ] Map all services in `packages/core/src/modules/*/services/` to their callers
- [ ] Identify shared utilities in `packages/core/src/lib/` that should be in application package
- [ ] Check for circular dependencies between core and modules

### Phase 2: Dependency Separation
- [ ] Remove `@sapphire/framework`, `@sapphire/pieces`, `@sapphire/dexcorators` from @lumi/core
- [ ] Remove `discord.js`, `@discordjs/*` from @lumi/core
- [ ] Remove `@prisma/client` → tools will install their own
- [ ] Remove `ioredis`, `bullmq` → separate infrastructure package
- [ ] Remove `ahocorasick`, `semver` → utilities or application logic, not framework

### Phase 3: Core Package Cleanup
- [ ] Update `packages/core/package.json` exports to reflect new dependencies
- [ ] Remove framework-specific imports from core code
- [ ] Update internal imports to skip framework-specific modules
- [ ] Test that `packages/core/index.ts` and entry points still work

### Phase 4: Application Package Creation
- [ ] Create `packages/application/package.json`
- [ ] Move core business services to `packages/application/services/`
  - [ ] Create structure: `application/src/services/guild/`, `moderation/`, `config/`, etc.
  - [ ] Extract services from each module in priority order
  - [ ] Keep service contracts (interfaces) in `packages/application/src/services/interfaces/`
- [ ] Update service callers to use new import paths

### Phase 5: Infrastructure Package Creation
- [ ] Create `packages/infrastructure/package.json`
- [ ] Move database access to infrastructure:
  - [ ] Extract `@prisma/client` usage to infrastructure layer
  - [ ] Create database repositories in infrastructure
- [ ] Move Redis access to infrastructure:
  - [ ] Extract `ioredis` usage to infrastructure layer
  - [ ] Move cache abstractions to infrastructure
- [ ] Move queue access to infrastructure:
  - [ ] Extract `bullmq` usage to infrastructure layer
  - [ ] Create job queue abstractions

### Phase 6: API Package Independence
- [ ] Verify `apps/api/package.json` only depends on contracts + observability
- [ ] Create application services for API (if needed)
- [ ] Ensure API processes don't need Sapphire/Discord

### Phase 7: Testing & Verification
- [ ] Run typecheck on all packages
- [ ] Run tests to ensure no breakage
- [ ] Test module loading in worker
- [ ] Test RPC dispatch in api
- [ ] Validate scheduler still works

### Phase 8: Documentation
- [ ] Update AGENTS.md sections on packages/architecture
- [ ] Update architecture docs (rpc-bridge.md, etc.)
- [ ] Document service layer boundaries
- [ ] Update module system docs