# Lumi Monorepo Audit & Hardening Rulebook

This rulebook is the mandatory specification for all orchestrator and subagent workflows during the full-repo audit and hardening pass. Every rule herein is non-negotiable and strictly enforced by automated and adversarial review gates.

---

## 1. Architectural Ground Rules

1. **Zero Cross-Module Import Law**:
   - Files under `packages/core/src/modules/<name>/` must NEVER import directly or indirectly from a sibling module (`packages/core/src/modules/<other>/`).
   - Shared cross-module functionality must reside in `#lib/*`, `#database/*`, or `#utilities/*`.

2. **Database Access & Abstraction**:
   - All runtime database operations must use `container.db` (`DatabaseService`).
   - Direct access via `container.prisma` is strictly prohibited, with the sole exception of the two documented bootstrap routines in `LumiClient.ts`.

3. **Cache Invalidation Discipline**:
   - Cache invalidations must occur exclusively via `container.invalidation` (`CacheInvalidationService`).
   - Direct calls to `redis.del`, raw pattern keys, or unmanaged Redis deletion are prohibited.

4. **Discord Embed Construction**:
   - Never instantiate raw `new EmbedBuilder()` in commands, services, or listeners.
   - Use `#utilities/cards.js` card builders (`makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeListCard`, etc.) or command context reply helpers (`replySuccess`, `replyError`, `sendReply`, `ctx.replySuccess`, `ctx.replyError`).

5. **Panels & UI Kits**:
   - Discord interactive/admin panels must use the `#utilities/panels.js` kit, never hand-rolled message components or raw layout arrays.

6. **Permit Nodes Registration**:
   - Any new or updated permission-gated feature or node must be explicitly declared and registered in `packages/core/src/lib/permissions/permit-nodes.ts`.

7. **Bounded Autocomplete**:
   - Bounded-value STRING or NUMBER options must implement `Command.autocompleteRun` utilizing `#utilities/autocomplete.js` helpers rather than unvalidated free text.

8. **Dashboard ↔ Worker Isolation**:
   - `apps/dashboard` must NEVER import or interact with Postgres, Prisma, Redis, or the Discord bot token directly.
   - All dashboard data fetching and operations must route through the internal HTTP RPC bridge (`packages/contracts/src/rpc.ts` `RpcRequestPayloads` / `RPC_ACTIONS`, `packages/core/src/lib/rpc/core-rpc.ts`, and callers in `dashboard-fetch.ts` or `actions/*`).

9. **Import Aliases & Extensions**:
   - Internal imports within packages must use subpath aliases with explicit `.js` suffixes (`#alias/*.js`), matching `package.json` `imports`.
   - Cross-package imports must use `@lumi/<package>` workspace names, never relative traversal across package roots (`../../packages/...`).

10. **Addon SDK Boundary**:
    - Third-party addon code and examples must only import public exports from the `lumi` SDK surface (`lumi`, `lumi/commands`, `lumi/permissions`, `lumi/scheduling`, `lumi/ui`, `lumi/utils`), never internal `#core`, `#lib`, `#database`, or `#utilities` paths.

---

## 2. Scope Boundaries

### In-Scope
- Vulnerability detection and remediation (injection, SSRF, auth/permission bypass, unsafe deserialization, race conditions).
- Dead code elimination (verified orphaned files, unused internal exports, unreachable branches).
- Performance enhancements (N+1 queries, missing query indexes, unbounded async loops, memory leaks, client re-renders).
- Strict enforcement of `AGENTS.md` and `AUDIT-RULEBOOK.md` ground rules.
- Documentation updates to align with actual code contracts and exported surfaces.

### Out-of-Scope (Strictly Banned)
- Modifying public RPC contracts (`RPC_ACTIONS`, `RpcRequestPayloads`, `RpcResponsePayloads`) or breaking existing dashboard-worker payloads.
- Breaking public APIs or changing Discord user-facing command structures.
- Bumping major package dependency versions.
- Speculative refactoring, style rewrites, or premature abstractions not tied to an audit defect.

---

## 3. Strict Git Execution Policy for Agents

When operating inside worktrees or shared shard environments:

### Allowed Commands
- `git add <specific-file-1> <specific-file-2>` (explicit file paths only)
- `git commit -m "<structured message>"`
- `git status`
- `git diff <specific-file>`

### Banned Destructive Commands
- `git stash`, `git stash pop`, `git stash drop`
- `git reset` (any form, `--hard`, `--soft`, `--mixed`)
- `git checkout -- .`, `git restore .`
- `git clean -fd`
- `git add .`, `git add -A`
- Any command that modifies or resets files outside the unit's declared scope.

If an implementer makes an erroneous edit, it must inspect the file and edit forward using native tools (`Edit`/`Write`).

---

## 4. Two-Reviewer Adversarial Gate

No unit of work is considered complete or mergeable until two independent reviewers submit an uncoordinated **APPROVE** verdict:

1. **Reviewer 1 (Correctness & Invariant Enforcement)**:
   - Verifies the fix resolves the exact reported vulnerability/defect.
   - Verifies zero regressions against the 10 Ground Rules.
   - Verifies full typecheck, lint, and test pass on affected packages.

2. **Reviewer 2 (Minimality, Security & Cleanliness)**:
   - Verifies surgical diff: minimal lines changed, no extraneous formatting or drive-by cleanup.
   - Verifies no banned git commands were executed.
   - Confirms proper tests or test updates were included where appropriate.

If either reviewer rejects, the feedback is surfaced back to the implementer for a revision pass (maximum 2 iteration rounds before human escalation).

---

## 5. Verification Commands

All checks must be executed inside the Nix devshell:
- Typecheck: `nix develop --command bun run typecheck`
- Lint: `nix develop --command bun run lint`
- Tests: `nix develop --command bun run test`
