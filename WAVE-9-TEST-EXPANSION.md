# Wave 9: Test Coverage Expansion — Overview

**Status:** Planning & Scoping Complete (No implementation yet)
**Target Coverage:** 85% on critical paths (currently ~50%)
**Estimated Effort:** 8-10 days
**Priority:** HIGH — Foundation for production stability

---

## What Is Wave 9?

Wave 9 is a **systematic test coverage expansion** targeting critical gaps that could mask production failures. Unlike adding random tests, Wave 9 focuses on:

- **High-value paths:** Commands, permissions, RPC handlers
- **Error paths:** Discord API failures, malformed input, race conditions
- **Invariants:** Permission boundaries, cache invalidation, idempotency

---

## Current State: 97 Tests (50% Coverage)

### What's Well Tested ✓
- Moderation logic (ban, kick, warn, case numbering)
- Module lifecycle (enable, disable, install)
- Permission system (permits, roles)
- Some RPC GET handlers
- Database repositories & atomic operations

### What's Missing ✗
- **Core commands** — help, ping, about, dashboard, download, repo, lumi (0% test coverage)
- **RPC SET operations** — config.set, module.toggle, settings.set (~10% coverage)
- **Discord errors** — 404 guild, 403 permission, 429 rate limit (0%)
- **Concurrency** — duplicate interactions, concurrent updates (30%)
- **Cache invalidation** — invalidation patterns & timing (25%)
- **Input validation** — malformed input, oversized payloads (40%)
- **Scheduled tasks** — retry logic, idempotency (0%)

---

## Three-Phase Roadmap

### Phase 1: Command & Permission Coverage (Days 1-4)
**Deliverable:** 100+ new tests covering all commands and permission enforcement

**Gap #1:** Core Commands
- Commands: `help`, `ping`, `about`, `dashboard`, `download`, `repo`, `lumi`
- Coverage: Happy path, error path, option handling, localization

**Gap #2:** Permission Enforcement
- All destructive commands: `ban`, `kick`, `timeout`, `warn`, `softban`, `quarantine`
- Coverage: Owner bypass, mod permission check, user denial

### Phase 2: RPC Completeness (Days 5-8)
**Deliverable:** 80+ new tests covering all RPC endpoints and error scenarios

**Gap #3:** RPC SET/DELETE Operations
- Handlers: `config.set`, `module.toggle`, `settings.set`, `permits.*`, `setup.run`
- Coverage: Success, validation, side effects (invalidation), error paths

**Gap #4:** Discord API Error Handling
- Scenarios: 404 (guild/channel/user), 403 (permission), 429 (rate limit), timeout
- Coverage: Error → user-friendly message, idempotency, retry safety

### Phase 3: Robustness & Edge Cases (Days 9-10)
**Deliverable:** 80+ new tests covering concurrency, caching, and validation

**Gap #5:** Cache Invalidation
- Patterns: Config change → invalidate `config:mod`, module toggle → invalidate `modules`
- Coverage: Correct keys invalidated, timing, no partial updates

**Gap #6:** Database Concurrency
- Scenarios: Duplicate interactions, concurrent config updates, case number allocation
- Coverage: Idempotency, uniqueness, race condition safety

**Gap #7:** Input Validation
- Scenarios: Empty strings, 100KB payloads, SQL injection, negative numbers, emoji, RTL text
- Coverage: Validation before business logic, clear error messages, no crashes

---

## Documentation Provided

### 1. `docs/test-strategy.md`
**What:** Audit of current coverage + identified gaps + priorities
**Use:** Reference for understanding what needs testing

**Sections:**
- Current test coverage matrix (97 files → by area)
- 7 critical gaps ranked by impact
- Test implementation phases with effort estimates
- Coverage metrics: Current 50% → Target 85%

### 2. `docs/test-implementation-roadmap.md`
**What:** Detailed implementation guide with code examples
**Use:** Copy-paste patterns when implementing tests

**Sections:**
- Fixture factories (`createMockCommandContext`, `setupRpcHandler`)
- Command test patterns (basic, permissions, options, errors)
- RPC test patterns (GET, SET, DELETE, error responses)
- Integration test patterns (Discord errors, race conditions, validation, cache invalidation)
- Debugging tips & running tests

### 3. `docs/test-patterns-reference.md`
**What:** Quick lookup guide for specific test patterns
**Use:** Find the right pattern before implementing

**Sections:**
- Pattern index (command, RPC, integration)
- Copy-paste templates for each pattern type
- Common test utilities & assertions
- Debugging tips

### 4. `WAVE-9-TEST-EXPANSION.md`
**What:** This document — executive summary
**Use:** Starting point for Wave 9 work

---

## How to Start

### Option A: Start with Phase 1 (Recommended)
1. Read `docs/test-strategy.md` §Gaps 1-2
2. Copy fixture factory from `docs/test-implementation-roadmap.md` §1.1
3. Pick a command: `help`, `ping`, or `about`
4. Use template from `docs/test-patterns-reference.md` §Basic Command Test
5. Implement 10-15 test cases
6. Commit: `test: add help command tests`

### Option B: Start with Quick Wins
1. Read `docs/test-strategy.md` §Quick Win section
2. These take 3-4 hours each:
   - `help.test.ts` (basic)
   - `permission-enforcement.test.ts` (template-driven)
   - `discord-api-errors.test.ts` (pattern-driven)

### Option C: Start with RPC (Phase 2)
If you're most comfortable with RPC handlers:
1. Read `docs/test-strategy.md` §Gap #3
2. Copy fixture from `docs/test-implementation-roadmap.md` §1.2
3. Use template from `docs/test-patterns-reference.md` §RPC SET Operation
4. Start with `guildConfigSet` or `guildModuleToggle`

---

## Test Organization

```
packages/core/tests/
├── core/
│   ├── commands/                       # NEW (Phase 1)
│   │   ├── help.test.ts
│   │   ├── ping.test.ts
│   │   ├── about.test.ts
│   │   ├── dashboard.test.ts
│   │   ├── download.test.ts
│   │   ├── repo.test.ts
│   │   └── lumi.test.ts
│   ├── permission-enforcement.test.ts  # NEW (Phase 1)
│   └── (existing tests preserved)
├── lib/
│   ├── rpc-set-operations.test.ts      # NEW (Phase 2)
│   ├── discord-api-errors.test.ts      # NEW (Phase 2)
│   ├── redis-invalidation.test.ts      # NEW (Phase 3)
│   ├── input-validation.test.ts        # NEW (Phase 3)
│   └── (existing tests preserved)
├── repositories/
│   ├── race-conditions.test.ts         # NEW (Phase 3)
│   └── (existing tests preserved)
└── modules/
    └── mod/
        ├── commands/                   # NEW (Phase 1)
        │   ├── ban.test.ts
        │   ├── kick.test.ts
        │   └── ...
        └── (existing tests preserved)
```

---

## Key Patterns to Remember

### Command Tests
```typescript
const { ctx } = createMockCommandContext();
await command.run(ctx as any, options);
expect(ctx.reply).toHaveBeenCalled();
```

### RPC Tests
```typescript
const { guild } = await setupRpcHandler();
const handler = rpcHandlers[RPC_ACTIONS.guildConfigSet];
const result = await handler({ id, action, guildId, data });
expect(result.ok).toBe(true);
```

### Permission Tests
```typescript
const { ctx, setMemberRoles } = createMockCommandContext({
  userId: "999999999999999999", // owner
});
// or
setMemberRoles(["MOD_ROLE"]);
```

### Error Tests
```typescript
container.client.guilds.fetch = vi
  .fn()
  .mockRejectedValue(DiscordErrors.guildNotFound("123"));
```

---

## Success Criteria (Wave 9 Complete)

✓ All 97 existing tests still pass
✓ New test files follow established patterns (mocks, fixtures, assertions)
✓ ≥ 85% code coverage on core command/RPC paths
✓ No permission bypass regressions
✓ Concurrent update invariants tested and documented
✓ Discord API error scenarios handled gracefully
✓ All 3 phases complete + documented

---

## Implementation Checklist

### Phase 1: Commands & Permissions (Days 1-4)
- [ ] `core/commands/help.test.ts` — option parsing, pagination
- [ ] `core/commands/ping.test.ts` — latency response
- [ ] `core/commands/about.test.ts` — version/metadata
- [ ] `core/commands/dashboard.test.ts` — OAuth URL generation
- [ ] `core/commands/download.test.ts` — repo/module search
- [ ] `core/commands/repo.test.ts` — repo CRUD
- [ ] `core/commands/lumi.test.ts` — system status
- [ ] `core/permission-enforcement.test.ts` — permission matrix
- [ ] `modules/mod/commands/*.test.ts` — mod command permissions

### Phase 2: RPC & Discord Errors (Days 5-8)
- [ ] `lib/rpc-set-operations.test.ts` — all SET handlers
- [ ] `lib/discord-api-errors.test.ts` — 404, 403, timeout scenarios

### Phase 3: Robustness (Days 9-10)
- [ ] `lib/redis-invalidation.test.ts` — cache patterns
- [ ] `repositories/race-conditions.test.ts` — concurrency
- [ ] `lib/input-validation.test.ts` — malformed input

### Documentation
- [ ] Update `docs/testing.md` (if exists) with new patterns
- [ ] Add examples to module contributing guide
- [ ] Link to test-patterns-reference from CLAUDE.md (optional)

---

## Next Steps

1. **Read** `docs/test-strategy.md` completely
2. **Choose** Phase 1, 2, or 3 (or start with quick wins)
3. **Copy** fixture factory from `docs/test-implementation-roadmap.md`
4. **Pick** a specific gap from the checklist above
5. **Implement** 10-15 test cases using appropriate pattern
6. **Run** `bun run test` to verify
7. **Commit** with descriptive message
8. **Repeat** for next gap

---

## Useful Commands

```bash
# Run all tests
bun run test

# Run specific file
bun run test packages/core/tests/core/commands/help.test.ts

# Run with coverage
bun run test -- --coverage

# Watch mode
bun run test -- --watch

# Run tests matching pattern
bun run test -t "permission"
```

---

## References

- **Test Strategy (gaps, priorities):** `docs/test-strategy.md`
- **Implementation Guide (fixtures, patterns):** `docs/test-implementation-roadmap.md`
- **Quick Patterns (lookup, copy-paste):** `docs/test-patterns-reference.md`
- **Existing Tests:** `packages/core/tests/` (97 files showing established patterns)
- **Contracts:** `packages/contracts/src/rpc.ts` (RPC_ACTIONS definitions)
- **Mocks:** `packages/core/tests/mocks/` (existing mock patterns)

---

## Questions?

See **Debugging Tips** section in `docs/test-patterns-reference.md` for common troubleshooting.

For questions about specific patterns:
1. Search `docs/test-patterns-reference.md` for your use case
2. Look at existing similar tests in `packages/core/tests/`
3. Check `docs/test-implementation-roadmap.md` Part 7: Implementation Checklist

---

**Wave 9 is a high-ROI investment in production stability.**

Every test prevents one runtime failure, catches one regression, and documents expected behavior.

Let's make Lumi bulletproof. 🎯
