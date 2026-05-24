# Quality Improvements TODO

## How to read this

Each item is a concrete, findable issue. Priority: **P0** (bug-risk) > **P1** (quality) > **P2** (polish).  
Skyra patterns are referenced as the target convention.

- [ ] Implement custom nickname hierarchy (Moderator, Helper, Chat Manager) for `.nick` command.


### [ ] Fix empty catch blocks (9 files)

These silently swallow errors, masking real failures at runtime.

| File | Line | What it swallows |
|------|------|-----------------|
| `src/core/permissions/index.ts` | 49 | Entire DB fetch in permission resolution — could silently grant wrong access |
| `src/core/lib/downloader/resolver.ts` | 100 | File access errors in `_exists()` |
| `src/modules/afk/data/afk.ts` | 64 | AFK deletion failures |
| `src/core/rabbitmq/index.ts` | 108 | JSON parse errors in RPC handler |
| `src/database/redis.ts` | 139 | Redis connection errors |
| `src/core/lib/ping-collect.ts` | 177, 250, 276, 429 | Gateway, postgres, redis, rabbitmq ping failures |

**Fix:** Change to `catch (err: unknown)` + `container.logger.error(...)` + typed fallback.  
**Skyra pattern:** Every catch logs the error — none are empty.

### [ ] Fix silent `.catch(() => {})` swallows (26 occurrences)

Fire-and-forget promises discard errors silently. Highest density in `src/modules/afk/listeners/messageCreate.ts` (9 instances).

**Fix:** At minimum log errors. For fire-and-forget Discord API calls, use `catch((err) => container.logger.warn('[AFK] ...', err))`.  
**Skyra pattern:** Never fire-and-forget without logging.

### [ ] Fix GDPR `deleteUserData` contract violations (2 issues)

Per `AGENTS.md`: *"Each module must implement `deleteUserData(userId, requester)`"*

- `src/modules/afk/index.ts:66` — missing second `_requester` param
- `src/modules/raids/index.ts` — does not override `deleteUserData` at all (uses empty base impl)

**Fix:** Add `_requester: RequesterType` param to `AfkModule.deleteUserData`. Implement `RaidsModule.deleteUserData`.

---

## P1 — Type safety

### [ ] Eliminate `as any` casts (16 instances)

| File | Lines | Problem |
|------|-------|---------|
| `src/core/permissions/preconditions/PermissionOverrides.ts` | 24, 25, 37, 48, 49 | Guild/role access cast to `any` |
| `src/core/module-system/ModuleStore.ts` | 96, 98, 102 | Store unload/discovery bypasses types |
| `src/core/module-system/ServiceStore.ts` | 6 | `super(Service as any, ...)` |
| `src/core/module-system/Module.ts` | 69 | `ApplyOptions(options)(ctor as any)` |
| `src/core/lib/commands.ts` | 37 | `(this as any).container.moduleManager` |
| `src/core/permissions/index.ts` | 28 | `(interactionOrMessage as any).userId` |
| `src/core/lib/ping-collect.ts` | 364, 399, 420 | `globalThis as any`, `client.ws as any`, `process as any` |
| `src/modules/afk/interaction-handlers/mentions.ts` | 28 | `((s: string) => s) as any` |

**Fix:** Replace with proper type assertions or narrow the types. PermissionOverrides should define a proper `GuildMessage` union. ping-collect should type the properties it needs from `client.ws`.  
**Skyra pattern:** Nearly zero `as any` in comparable code.

### [ ] Type `catch` clauses (23 instances)

These use `catch (err)` instead of `catch (err: unknown)`, making `err` implicitly `any`.

**Fix:** Add `: unknown` annotation to all catch clauses. Use `errAsError(err)` helper or `errorFrom(err)` to safely extract `.message`.  
**Skyra pattern:** `catch (error: unknown)` everywhere — they never use bare `catch (err)`.

### [ ] Remove `any` defaults from RPC generics

`src/core/rabbitmq/index.ts:57,64,70` — `RpcRequest<T = any>`, `RpcResponse<T = any>`, `RpcHandler<TIn = any, TOut = any>`

**Fix:** Remove default `= any`. Callers that don't specify a type will get a compile error — which is the point.  
**Skyra pattern:** Generic constraints are always explicit.

### [ ] Fix `Record<string, any>` in `publishEvent`

`src/core/rabbitmq/index.ts:153` — `payload: Record<string, any>`

**Fix:** Use `Record<string, unknown>` and narrow inside the handler.

---

## P1 — Architecture & correctness

### [ ] Add module tests (afk, raids)

Neither user-facing module has tests. At minimum:

- `src/modules/afk/data/afk.ts` — test CRUD for AFK entries, cooldown logic, mention tracking
- `src/modules/raids/data.ts` — test raid join recording, lockdown cycle, unlock scheduling

**Skyra pattern:** Every manager class has unit tests for all CRUD paths.

### [ ] Add return type annotations to exported functions (~18 missing)

Key files:
- `src/modules/afk/data/afk.ts:59,69,84,95,100,108` — exported async functions missing `Promise<T>` return types
- `src/modules/afk/index.ts:10` — `sanitizeReason` missing `: string`
- `src/modules/raids/data.ts:21,25,35,40,46` — missing return types
- `src/core/lib/commands.ts:10` — `sendReply` missing return type
- `src/core/listeners/commands/_shared.ts:11` — `cardFor` missing return type

**Fix:** Add explicit return types.  
**Skyra pattern:** Every exported function has an explicit return type.

---

## P1 — Error handling

### [ ] Add typed error helpers

Create `src/utilities/errors.ts` with:
- `errorFrom(err: unknown): Error` — safely extracts `.message` and stack
- `logError(context: string, err: unknown): void` — typed log wrapper

Then replace `catch (err) { container.logger.error('...', err) }` with `catch (err) { logError('...', err) }`.

**Skyra pattern:** `resolveOnErrorCodes` + typed utilities for all error handling.

---

## P2 — Naming & conventions

### [ ] Standardize private method naming

Current: `_underscorePrefix` (consistent in this codebase).  
Skyra uses: `private methodName` without underscore.

**Decision:** Either codify in AGENTS.md or migrate to Skyra style. But pick one and stick to it.

### [ ] Remove unnecessary dynamic imports

`src/core/modules/CoreModule.ts:123-124` — `await import('node:fs')` and `await import('node:path')` inside `onLoad()`. These are built-in modules — import statically at top of file.

### [ ] Audit JSDoc comments

Some JSDoc is stale (e.g., `formatting.ts` docs referencing renamed params). Either keep JSDoc in sync or remove it.

---

## P2 — Minor polish

### [ ] Clean up eslint-disable directives (7 instances)

Each suppression should include a comment explaining *why* it's necessary and what would need to change to remove it.

### [ ] Review `@ts-expect-error` in commands.ts

`src/core/lib/commands.ts:34` — verify it's still needed after Sapphire v5 API changes.

---

## Running tally

| Category | Count | Priority |
|----------|-------|----------|
| Empty catch blocks | 9 | P0 |
| Silent `.catch()` swallows | 26 | P0 |
| GDPR violations | 2 | P0 |
| `as any` casts | 16 | P1 |
| Implicit `any` in catches | 23 | P1 |
| `any` defaults in generics | 4 | P1 |
| Missing return types (exports) | ~18 | P1 |
| Untested modules | 2 | P1 |
| Dynamic imports | 1 | P2 |
| eslint-disable directives | 7 | P2 |
| **Total** | **~108** | |
