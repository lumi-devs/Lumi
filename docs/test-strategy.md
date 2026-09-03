# Test Strategy & Coverage Roadmap
**Wave 9: Test Coverage Expansion**

## Executive Summary

Lumi currently has **97 test files** with strong coverage in domain-specific logic (moderation actions, module system, RPC handlers). However, **critical gaps exist** in:
- Core command behavior (help, ping, about, dashboard, download, repo, lumi)
- Permission enforcement across commands
- Configuration lifecycle (enable/disable/install flows)
- RPC error paths and edge cases
- Database race conditions under concurrency
- Cache invalidation patterns
- Scheduled task idempotency
- Failure recovery and retry logic

This document maps current coverage, identifies 5-7 critical gap areas, and prioritizes tests for implementation.

---

## Current Test Coverage (97 files)

### Tested Well (High Confidence)
| Area | Test Files | Scope | Coverage |
|------|-----------|-------|----------|
| **Module Lifecycle** | `module_command.test.ts`, `module_store.test.ts` | install, enable, disable, state tracking | ~90% |
| **Moderation Logic** | `actions.test.ts`, `case-number-concurrency.test.ts`, `softban-action.test.ts`, `warnthresholds.test.ts` | case creation, concurrency, warn thresholds | ~85% |
| **Permissions** | `permits.test.ts`, `permit_export_import.test.ts`, `permit_autocomplete.test.ts` | permit CRUD, export/import, autocomplete | ~80% |
| **RPC Handlers** | `dashboard/moderation-rpc.test.ts`, `dashboard/appeals-rpc.test.ts`, `dashboard/audit-history-rpc.test.ts` (8 RPC test files) | moderation, appeals, audit, config GET operations | ~65% |
| **Utilities** | `utilities/temporary-message.test.ts`, `utilities/kit.test.ts`, `utilities/panels.test.ts` | helper functions | ~70% |
| **Database** | `Repository.test.ts`, `ConfigRepository.test.ts`, `mutate-atomic.test.ts` | repository patterns, atomic operations | ~75% |

### Partially Tested (Medium Confidence)
| Area | Test Files | Gap |
|------|-----------|-----|
| **Core Commands** | `module_command.test.ts`, `mydata_command.test.ts`, `permit_autocomplete.test.ts` | Only 3 of 10 commands have dedicated tests (module, mydata, permit) |
| **Module Configs** | Various module tests | Config GET tested; SET not systematically tested |
| **Validation** | Preconditions, addon validation tests | Input constraints not exhaustively tested |
| **Pagination** | Referenced in RPC tests | No dedicated pagination tests for edge cases |

### Untested or Missing (Low/No Coverage)
| Area | Impact | Reason |
|-------|---------|--------|
| **Command Behavior** | HIGH | No tests for `help.ts`, `ping.ts`, `about.ts`, `dashboard.ts`, `download.ts`, `repo.ts`, `lumi.ts` |
| **Permission Enforcement** | HIGH | Permission checks scattered across commands; no systematic command-permission tests |
| **RPC Set Operations** | HIGH | Only GET RPC handlers have tests; SET/DELETE handlers mostly untested (`config.set`, `module.toggle`, `settings.set`, etc.) |
| **Discord API Error Handling** | MEDIUM | No tests for 404 (missing guild/channel/user), timeout, rate limit scenarios |
| **Cache Invalidation** | MEDIUM | No systematic tests of Redis invalidation patterns |
| **Race Conditions** | MEDIUM | Only `case-number-concurrency.test.ts` covers concurrency; need more edge-case coverage |
| **Scheduled Tasks** | MEDIUM | No tests for retry logic, idempotency, or failure recovery in BullMQ jobs |
| **Malformed Input** | MEDIUM | No tests for extremely large payloads, empty/null values, SQL injection patterns |
| **Shard Restart** | LOW | Sharding safety not tested |

---

## Critical Gaps: Priority-Ordered Implementation Roadmap

### Gap #1: Core Command Coverage (HIGH PRIORITY)
**Impact:** Users interact with these commands constantly. Missing tests allow silent breakage.

**Commands needing tests:**
- `help.ts` — option handling, localization, autocomplete
- `ping.ts` — basic latency response, ephemeral behavior
- `about.ts` — version/metadata response, branding
- `dashboard.ts` — OAuth URL generation, permissions
- `download.ts` — repo list, module search, install flow
- `repo.ts` — repo CRUD (add/list/remove), validation
- `lumi.ts` — system status, shard info

**Test Strategy:**
- Mock `CommandContext` with guild, member, locale
- Test happy path, permission failure, missing guild/member
- Verify response structure, ephemeral flags, component state
- Check error messages for accuracy

**Estimated effort:** 3-4 days (70-100 test cases)

---

### Gap #2: Permission Enforcement in Commands (HIGH PRIORITY)
**Impact:** Permission bypass = security regression. No systematic coverage means tests miss enforcement.

**Scope:**
- Destructive commands need permission checks: `ban`, `kick`, `timeout`, `warn`, `softban`, `quarantine`
- Admin commands need role/ownership checks: `module`, `lumi`, `dashboard`, `permit`
- Create/Delete operations across all RPC handlers

**Test Strategy:**
- For each destructive command: test with OWNER (success), MOD (success if configured), USER (denied)
- For each admin endpoint: test guild owner bypass, permission delegation
- Test permission deny → error card with clear message

**Estimated effort:** 2-3 days (40-60 test cases)

---

### Gap #3: RPC Set/Delete Operations (HIGH PRIORITY)
**Impact:** Dashboard writes are synchronous and affect Discord UX immediately. Silent failures break configuration.

**Untested RPC Handlers:**
- `guild.module.toggle` — enable/disable modules
- `guild.config.set` — module configuration updates
- `guild.settings.set` — prefix, locale, timezone, mute role
- `guild.permits.create`, `.update`, `.delete` — permission management
- `guild.setup.run` — guild bootstrap (creates roles/channels)
- `guild.panic.set` — anti-nuke enable/disable
- All `system.*` write operations

**Test Strategy:**
- Mock `container.db`, `container.redis`, `container.client`
- Test happy path: update succeeds, invalidation fires, response is correct
- Test failure paths: missing guild, stale config, race condition, DB error
- Verify side effects: role created, channel created, cache invalidated

**Estimated effort:** 3-4 days (60-80 test cases)

---

### Gap #4: Discord API Error Handling (MEDIUM PRIORITY)
**Impact:** Users may delete guilds, channels, roles mid-operation. Bot may lack permissions. Lumi should handle gracefully.

**Scenarios to test:**
- Guild not found (404 on `guild.fetch()`)
- Channel not found (404 on `channel.fetch()`)
- Role not found (404 on `role.fetch()`)
- User not found (404 on user lookups in member.fetch)
- Bot lacking permissions (403 on role creation, message send)
- Discord rate limit (429 on API call)
- Discord timeout (5+ second API latency)
- Member not in guild (when trying to timeout/ban)

**Test Strategy:**
- Mock Discord API client with rejection scenarios
- For each scenario: verify error is caught, user gets clear message, no unhandled rejection
- Check that operation is idempotent if retried

**Estimated effort:** 2 days (40-50 test cases)

---

### Gap #5: Cache Invalidation & Redis Patterns (MEDIUM PRIORITY)
**Impact:** Stale cache → users see old data, configuration changes don't apply.

**Areas to test:**
- When config changes, Redis keys are deleted (not partially updated)
- Guild cache invalidation on role delete, member delete
- Permit cache invalidation on permit update
- Module state cache invalidation on enable/disable
- Redis connection loss doesn't corrupt local state

**Test Strategy:**
- Mock Redis client with spy on `del()`, `setex()` calls
- Trigger config update → verify correct keys invalidated
- Verify TTL semantics (short-lived vs long-lived)
- Test no-Redis fallback behavior (if any)

**Estimated effort:** 1 day (20-30 test cases)

---

### Gap #6: Database Concurrency & Transactions (MEDIUM PRIORITY)
**Impact:** Duplicate interactions, shard race conditions, lost updates.

**Scenarios to test:**
- Duplicate interaction delivery (user double-clicks button) → operation idempotent
- Concurrent config updates from dashboard + slash command → last-write-wins or explicit merge
- Case number allocation under concurrent mod actions → unique, sequential
- Scheduled task runs concurrently on multiple shards → task sees primary shard flag
- Member roles change mid-permission-check → graceful degradation

**Test Strategy:**
- Use `Promise.all()` to simulate concurrent requests
- Mock Prisma with transaction semantics
- Verify invariants: case numbers unique, config not corrupted, no orphaned records

**Estimated effort:** 2 days (30-40 test cases)

---

### Gap #7: Malformed Input & Validation Boundaries (MEDIUM PRIORITY)
**Impact:** Unexpected input crashes handlers or allows injection.

**Scenarios to test:**
- Extremely large payloads (10MB of text, 1000+ permit nodes)
- Null/undefined in required fields (should fail gracefully)
- SQL injection patterns in module names, permit names
- Invalid snowflakes (non-numeric IDs)
- Negative numbers where unsigned expected (duration, count)
- Unicode edge cases (emoji, ZWJ sequences, RTL text)

**Test Strategy:**
- Generate malformed inputs programmatically
- Verify validation layer rejects with clear error message
- No crashes, no info leaks

**Estimated effort:** 1 day (25-35 test cases)

---

## Test Implementation Phases

### Phase 1 (Days 1-4): Critical Command & Permission Coverage
- Implement Gap #1: Core command tests (help, ping, about, dashboard, download, repo, lumi)
- Implement Gap #2: Permission enforcement tests across destructive commands
- **Deliverable:** 100+ passing tests, no permission regressions

### Phase 2 (Days 5-8): RPC Completeness
- Implement Gap #3: RPC SET/DELETE handlers
- Implement Gap #4: Discord API error handling
- **Deliverable:** 80+ passing tests, all RPC operations covered

### Phase 3 (Days 9-10): Robustness & Edge Cases
- Implement Gap #5: Cache invalidation patterns
- Implement Gap #6: Database concurrency
- Implement Gap #7: Input validation
- **Deliverable:** 80+ passing tests, edge cases protected

---

## Test File Organization

```
packages/core/tests/
├── core/                                  # Core module commands
│   ├── commands/                          # NEW
│   │   ├── help.test.ts
│   │   ├── ping.test.ts
│   │   ├── about.test.ts
│   │   ├── dashboard.test.ts
│   │   ├── download.test.ts
│   │   ├── repo.test.ts
│   │   └── lumi.test.ts
│   ├── permission-enforcement.test.ts     # NEW - cross-command permission matrix
│   └── (existing tests preserved)
├── modules/
│   └── mod/
│       ├── commands/                      # NEW
│       │   ├── ban.test.ts
│       │   ├── kick.test.ts
│       │   ├── timeout.test.ts
│       │   ├── warn.test.ts
│       │   └── softban.test.ts
│       └── (existing tests preserved)
├── repositories/
│   ├── race-conditions.test.ts            # NEW - concurrent updates
│   └── (existing tests preserved)
├── lib/
│   ├── redis-invalidation.test.ts         # NEW - cache patterns
│   ├── discord-api-errors.test.ts         # NEW - 404, 403, timeout handling
│   ├── rpc-set-operations.test.ts         # NEW - RPC write paths
│   ├── input-validation.test.ts           # NEW - malformed input
│   └── (existing tests preserved)
└── utilities/
    └── (existing tests preserved)
```

---

## Test Coverage Metrics (Current → Target)

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| Core commands | 20% | 95% | +75% |
| Permission enforcement | 40% | 95% | +55% |
| RPC handlers (GET) | 75% | 100% | +25% |
| RPC handlers (SET/DELETE) | 10% | 90% | +80% |
| Discord API errors | 0% | 80% | +80% |
| Cache invalidation | 25% | 85% | +60% |
| Database concurrency | 30% | 85% | +55% |
| Input validation | 40% | 90% | +50% |
| **Overall Coverage** | ~50% | **85%** | **+35%** |

---

## Implementation Checklist (Wave 9)

- [ ] **Phase 1:** Core commands & permission enforcement
  - [ ] `help.test.ts` — option parsing, localization, pagination
  - [ ] `ping.test.ts` — latency calculation, ephemeral
  - [ ] `about.test.ts` — version/branding response
  - [ ] `dashboard.test.ts` — OAuth URL, permissions
  - [ ] `download.test.ts` — repo/module search, install
  - [ ] `repo.test.ts` — repo add/list/remove
  - [ ] `lumi.test.ts` — system status, shard count
  - [ ] `permission-enforcement.test.ts` — matrix of permission scenarios

- [ ] **Phase 2:** RPC completeness
  - [ ] `rpc-set-operations.test.ts` — all SET/DELETE RPC handlers
  - [ ] `discord-api-errors.test.ts` — 404, 403, timeout, rate limit

- [ ] **Phase 3:** Robustness
  - [ ] `redis-invalidation.test.ts` — cache invalidation patterns
  - [ ] `race-conditions.test.ts` — concurrent updates, duplicate interactions
  - [ ] `input-validation.test.ts` — malformed input handling

- [ ] Documentation
  - [ ] Update `docs/testing.md` with new test patterns
  - [ ] Add examples: how to mock CommandContext, RPC handlers, Discord API
  - [ ] Document test fixtures and shared setup

- [ ] CI/CD
  - [ ] Verify all 97 + new tests pass in CI
  - [ ] Coverage report: target ≥ 85% on critical paths

---

## Quick Win: Low-Hanging Fruit

If time is constrained, prioritize these (3-4 hours each):
1. **`help.test.ts`** — already has preconditions tests, just need command behavior test
2. **`permission-enforcement.test.ts`** — template-driven matrix, reusable across commands
3. **`discord-api-errors.test.ts`** — 404/403/timeout patterns apply across RPC
4. **`rpc-set-operations.test.ts`** — mostly copy-paste from existing RPC test patterns

---

## Success Criteria (Wave 9 Complete)

✓ All 97 existing tests still pass
✓ New test files follow existing patterns (mocks, fixtures, assertions)
✓ ≥ 85% code coverage on core paths
✓ No permission bypass regressions
✓ Concurrent update invariants documented and tested
✓ Discord error scenarios handled gracefully
✓ Test-to-code ratio reasonable (not >50% test code)
✓ CI feedback loop < 3 minutes for full test suite

---

## Notes

- **Mocking strategy:** Use `vitest` mocks consistently; avoid snapshot tests for Discord objects (fragile)
- **Data setup:** Use factories/builders for complex test data (cases, permits, configs)
- **Async handling:** Always await promises; use `vi.waitFor()` for eventual consistency
- **Permissions:** Leverage existing `preconditions.test.ts` patterns; extend with command-specific checks
- **RPC tests:** Reference `dashboard/moderation-rpc.test.ts` as the canonical pattern

---

## Related Documents

- `docs/architecture.md` — command lifecycle, RPC architecture
- `packages/core/tests/mocks/prisma.js` — existing Prisma mock patterns
- `packages/contracts/src/rpc.ts` — authoritative RPC contract definitions
- `packages/core/src/lib/command-context.ts` — CommandContext interface for command mocks
