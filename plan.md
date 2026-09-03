# LUMI — ALPHA ARCHITECTURE + PRODUCT OVERHAUL

## Progress log (tracked here, updated as sections are completed)

- [x] §6 COMMAND SYSTEM — confirmation prompts (`confirmPrompt`) wired into
  destructive mod/security commands: ban, kick, softban, timeout, quarantine,
  vcmute, lockdown, restore, panic. Legacy `messageRun`-only command (`nick`)
  modernized to `run(ctx: CommandContext)` with slash support added.
- [x] §6/§7 Multi-target moderation: `ban`, `kick`, `timeout`, `untimeout`,
  `quarantine`, `unquarantine`, `vcmute`, `vcunmute`, `softban`, `warn`,
  `notes`, `sanitize` now accept multiple members/users on the prefix path
  (`,mute @a @b @c`, `,ban id1 id2 id3`), aggregated into one reply card.
  Cap is configurable per-guild via Moderation module config
  (`max_multi_targets`, panel-exposed as "Max Targets Per Command").
- [x] Stale cruft sweep (Wave 1): audited `apps/docs/.astro`, `apps/worker/package.json`
  exports, `docs/engineering/ROBUSTNESS-ROADMAP.md` references, `AGENTS.md` doc paths,
  `packages/sharding` vs `packages/observability` overlap — all already clean, no
  changes needed.
- [x] RPC de-duplication (Wave 3): the originally-suspected `dispatchRpc`/`handleRpcHttp`
  duplication didn't exist (already centralized), but found and fixed real duplication —
  `SnowflakeSchema`/`parsePayload`/`paginate`/page-size schemas were byte-identical
  between `lib/rpc/core-rpc.ts` and `modules/dashboard/lib/helpers.ts`. Extracted to
  `lib/rpc/validation.ts` as single source of truth; unused re-exports dropped (no
  backward-compat shims, per alpha status).
- [x] Docs-app tooling gap (Wave 4): `apps/docs` now has a `lint` script and is wired
  into root `lint:all`; fixed 3 real lint/type issues it surfaced (unnecessary `async`,
  floating clipboard promises, unneeded type assertion). No test script added — no
  test files exist there yet.
- [x] Config schema unification (dashboard ↔ Discord panel): both surfaces already
  shared `ConfigField.group` metadata end-to-end; the one gap was the dashboard's
  `module-config-form.tsx` rendering fields as one flat list instead of grouping by
  section. Fixed — now renders per-section headers matching the existing design
  idiom, same section data the Discord panel already grouped by.
- [x] Discord Components V2 audit: confirmed the config/settings panel already uses
  Components V2 exclusively (`ContainerBuilder`/`TextDisplayBuilder`/`SectionBuilder`/
  `SeparatorBuilder`, `MessageFlags.IsComponentsV2`) with no embeds, on discord.js
  `^14.27.0` — no migration was needed, it predates this pass.
- [x] Dashboard visual/animation audit: confirmed the dashboard already has a complete
  "Midnight Sapphire" design system (tokens, glass chrome, `useStaggerIn`/`usePopIn`/
  `useCountUp`/`usePageTimeline` animation hooks, tilt cards, magnetic CTAs, reduced-
  motion support throughout) from a prior commit — no changes needed.
- [x] Error-handling consolidation (Wave 2): merged `command-errors.ts` into
  `command-response.ts` (single real consumer); renamed `command-response.ts`'s
  `errorCard()` → `resolveErrorCard()` to stop colliding in name with
  `cards.ts::makeErrorCard`; left `errors.ts` alone (genuinely generic, 30+ unrelated
  consumers). Migrated 7 command call sites from low-level card builders onto
  `ctx.replyX` where it was a faithful match (`dashboard.ts`, `download.ts`, `lumi.ts`,
  `mydata.ts`, `repo.ts`, `cases.ts`); left the rest on low-level builders by design
  (need `CardOptions` features `ctx.reply` doesn't support, no `CommandContext`
  available, or genuinely mixed raw-send/edit flows like `purge.ts`).
  **Bonus find while migrating `mydata.ts`**: `forgetMe` had a real, pre-existing GDPR
  bug — `const confirmed = await confirmPrompt(...)` never destructured `{ confirmed }`,
  so the "cancel" branch was dead code and data deletion proceeded regardless of the
  user's answer. Fixed (`const { confirmed } = ...`); the old unit test had masked this
  by mocking `confirmPrompt` to resolve a raw boolean instead of its real
  `{ confirmed, message }` shape — test corrected to match reality, bug caught and
  fixed as a result.
- [x] **All waves of the scoped cleanup plan (`.claude/plans/jazzy-rolling-pinwheel.md`)
  are now complete.** Full verification on `main`: typecheck clean, lint clean,
  test 104/104 files · 1001/1001 tests (core) + 13/13 files · 91/91 tests (dashboard),
  all green.
- [ ] Everything below this line is still the original, unexecuted "alpha rewrite"
  instruction set — not pursued as a wholesale rewrite per the scoping decision above;
  future work here should be picked as new, individually-scoped tasks rather than
  reopening the blanket mandate.

---

You are now the principal engineer responsible for a full alpha-stage rewrite of Lumi.

This is NOT a normal refactor.

You have broad authority to restructure, delete, consolidate, replace, rename, and redesign code throughout the repository.

The objective is:

    MAXIMUM FUNCTIONALITY
    + MAXIMUM RELIABILITY
    + MINIMUM ACCIDENTAL COMPLEXITY
    + EXCELLENT DEVELOPER EXPERIENCE
    + EXCELLENT DISCORD UX
    + EXCELLENT DASHBOARD UX
    + EXCELLENT DOCUMENTATION

You are explicitly allowed to break APIs, reorganize packages, replace abstractions, redesign interfaces, and migrate internal architecture because this is an ALPHA BREAK.

The only hard constraint is:

    DO NOT REDUCE FUNCTIONALITY.

Preserve existing capabilities and scale unless you discover something that is genuinely redundant, dead, broken, or superseded by a better implementation.

Do not preserve bad architecture merely because it already exists.

============================================================
0. READ THIS FIRST
============================================================

Read:

- AGENTS.md
- docs/README.md
- docs/architecture.md
- docs/dashboard.md
- docs/api-reference.md
- docs/guides/*
- package.json files
- workspace configuration
- every package/app boundary
- tests
- Prisma schema
- RPC contracts
- module SDK
- panel/card/UI utilities

AGENTS.md is authoritative for repository-specific rules.

Lumi currently uses:

- Bun
- TypeScript
- @sapphire/framework
- discord.js v14
- Prisma/PostgreSQL
- Redis
- BullMQ
- Next.js dashboard
- Turborepo
- internal HTTP RPC bridge
- modular addon architecture
- sharding
- OpenTelemetry
- Prometheus
- Redis Streams

Respect those architectural constraints unless you find a materially better design and are willing to migrate the entire affected surface correctly.

Never invent architecture before understanding the existing one.

============================================================
1. FIRST MISSION: RECONNAISSANCE
============================================================

Before editing substantial code, perform a repository-wide architecture audit.

Create an internal or committed:

    PLAN.md

containing a detailed modernization plan.

The plan must identify:

- duplicate infrastructure
- unnecessary abstractions
- home-grown framework behavior that Sapphire already provides
- home-grown Discord API behavior that discord.js already provides
- unnecessary wrappers
- dead utilities
- over-engineered services
- duplicated validation
- duplicated error handling
- duplicated interaction handling
- duplicated command lifecycle logic
- duplicated pagination/component logic
- duplicated permission handling
- duplicated caching
- duplicated scheduling logic
- duplicated event/listener plumbing
- dashboard duplication
- RPC duplication
- unnecessary type duplication
- unnecessary database access layers
- unnecessary Redis abstractions
- unnecessary Discord object abstractions
- inconsistent UI primitives
- inconsistent UX patterns
- documentation drift
- test gaps
- performance bottlenecks
- likely race conditions
- likely memory leaks
- shard-safety issues
- concurrency issues
- failure/retry weaknesses

For every major handwritten abstraction, answer:

1. Why does this exist?
2. Does Sapphire already solve it?
3. Does discord.js already solve it?
4. Does an existing Lumi primitive solve it?
5. Can it be deleted?
6. Can multiple implementations become one?
7. Is the abstraction actually buying us anything?

Be ruthless.

============================================================
2. USE THE ECOSYSTEM PROPERLY
============================================================

Lumi must stop reinventing framework functionality unnecessarily.

Use Sapphire as the framework layer wherever appropriate.

Investigate the current Sapphire APIs and patterns rather than assuming what Sapphire supports.

Prefer framework-native mechanisms for things such as:

- command loading
- command stores
- listeners
- preconditions
- argument handling
- interaction handling
- command lifecycle
- cooldowns
- error handling
- plugin functionality
- stores/registries
- framework conventions
- middleware-like lifecycle behavior where applicable

Prefer discord.js primitives for:

- builders
- interactions
- collectors
- permissions
- component handling
- channel/member/role resolution
- REST interactions
- Discord API abstractions
- native caching where appropriate

DO NOT blindly introduce Sapphire wrappers around Sapphire.

DO NOT blindly introduce Lumi wrappers around discord.js.

Abstraction must earn its existence.

A good rule:

    framework capability -> use framework
    Discord capability -> use discord.js
    application-domain behavior -> Lumi code
    cross-cutting infrastructure -> shared Lumi infrastructure

Keep Lumi-specific code where Lumi actually has product/domain semantics.

============================================================
3. STUDY STRONG REFERENCE IMPLEMENTATIONS
============================================================

Use external research to understand proven architecture and UX patterns.

Study at minimum:

- Lumi itself
- Sapphire
- Skyra
- mature Discord moderation/infra bots
- mature Discord bot dashboards
- Dyno
- Wick
- Carl-bot
- YAGPDB
- other high-quality open-source Discord bot implementations where useful

Also investigate the intended "Rebot" reference if a relevant Discord project can be identified.

Do NOT copy code.

Extract principles.

Pay particular attention to:

- command architecture
- modularity
- lifecycle handling
- error handling
- permissions
- configuration UX
- dashboard navigation
- feature discoverability
- documentation structure
- admin workflows
- observability
- failure handling
- performance
- testing
- onboarding

Skyra is especially important as a Sapphire-based reference.

Lumi should feel like a project that belongs in the same engineering tier.

============================================================
4. THE BIG RULE: DEBLOAT WITHOUT SHRINKING
============================================================

"Debloat" means:

    less accidental complexity

NOT:

    fewer features

You must preserve:

- commands
- modules
- scheduled tasks
- permissions
- dashboard capabilities
- addon functionality
- observability
- integrations
- configuration capabilities
- interaction flows
- operational tooling

You may completely rewrite the implementation underneath them.

Prefer:

    one good abstraction

over:

    five nearly-identical abstractions.

Prefer:

    framework behavior

over:

    custom framework behavior.

Prefer:

    data-driven configuration

over:

    enormous switch statements / repetitive UI code.

Prefer:

    composable primitives

over:

    feature-specific utility explosions.

Delete dead code.

Delete unreachable code.

Delete obsolete compatibility layers.

Delete duplicated utilities.

Delete wrappers that provide no semantic value.

Delete code made obsolete by framework functionality.

Do not delete working functionality simply because it is inconvenient to migrate.

============================================================
5. MODULE ARCHITECTURE
============================================================

Preserve the zero-cross-module-import rule.

Do not weaken module isolation.

However, aggressively simplify module internals.

Every module should have a clear responsibility.

Review whether each module really needs:

- commands/
- listeners/
- services/
- interaction-handlers/
- scheduled-tasks/

Do not create empty architectural ceremony.

Use Sapphire's native stores/lifecycle mechanisms where appropriate.

Module code should be boring.

It should mainly express:

    WHAT THE FEATURE DOES

not:

    HOW OUR INTERNAL FRAMEWORK WORKS

Move generic infrastructure downward into the framework/core layer.

Keep actual business logic in the module.

============================================================
6. COMMAND SYSTEM
============================================================

Perform a full command-system rewrite where beneficial.

Audit every command for:

- duplicated validation
- duplicated permission checks
- duplicated error handling
- duplicated reply construction
- repeated Discord fetches
- inefficient database calls
- repetitive option parsing
- inconsistent autocomplete
- inconsistent cooldowns
- inconsistent ephemeral behavior
- inconsistent localization
- unnecessary service layers

Use Sapphire command conventions aggressively.

Use native discord.js command builders and native Discord option types where possible.

Use autocomplete for bounded discoverable values.

Keep command implementations small and readable.

Ideal command structure:

    parse
    authorize
    execute domain operation
    present result

Do not turn every command into a 900-line "enterprise service".

============================================================
7. DISCORD UX
============================================================

The Discord experience must be redesigned as a coherent product.

Review EVERY user-facing interaction.

Audit:

- embeds/cards
- buttons
- select menus
- modals
- pagination
- ephemeral replies
- confirmation flows
- errors
- success messages
- warnings
- permission failures
- cooldown messages
- autocomplete
- command naming
- command descriptions
- option naming
- help output
- empty states
- loading states
- retry states
- destructive actions

Use the existing Lumi card/panel helpers rather than hand-building UI repeatedly.

However, if those helpers themselves are poorly designed:

    REWRITE THEM.

Do not preserve bad primitives merely because AGENTS.md says they exist.

Create a coherent visual language.

Discord UX should feel:

- polished
- fast
- predictable
- compact
- useful
- readable
- consistent
- low-friction

Avoid unnecessary embed spam.

Avoid huge walls of text.

Avoid button layouts that look improvised.

Make interaction states obvious.

Destructive actions must have appropriate confirmation.

Long-running operations need meaningful progress/loading feedback.

Errors should explain:

    what happened
    why it happened
    what the user can do next

============================================================
8. DASHBOARD — FULL PRODUCT REDESIGN
============================================================

Treat the dashboard as a first-class SaaS product.

Do NOT merely reskin the current dashboard.

Audit the entire application.

Redesign:

- information architecture
- navigation
- server selection
- server overview
- module navigation
- configuration pages
- forms
- tables
- charts
- activity feeds
- permissions
- command configuration
- system status
- shard/fleet views
- settings
- onboarding
- empty states
- loading states
- errors
- destructive actions
- confirmations
- success feedback
- responsive layouts
- mobile behavior

Target product quality comparable to excellent modern SaaS.

Reference:

- Apple-level visual restraint
- Google-level interaction clarity
- Linear-level information density
- Stripe-level configuration UX
- modern developer SaaS dashboards

Do NOT blindly copy any brand.

Build a Lumi design language.

PRINCIPLES:

- fewer visual layers
- clearer hierarchy
- stronger spacing rhythm
- predictable navigation
- excellent typography
- excellent empty states
- restrained animation
- excellent keyboard usability
- responsive design
- consistent forms
- obvious save state
- immediate feedback
- no mystery controls
- no unnecessary modals
- no UI clutter

Every settings page should answer immediately:

    What does this feature do?
    Is it enabled?
    What does the current configuration mean?
    What can I change?
    What happens when I change it?

Use progressive disclosure.

Do not overwhelm users with every advanced option at once.

============================================================
9. DASHBOARD DESIGN SYSTEM
============================================================

Create/rework a true reusable design system.

Centralize:

- typography
- spacing
- radii
- shadows
- borders
- colors
- surfaces
- states
- icons
- buttons
- inputs
- selects
- switches
- tabs
- cards
- tables
- badges
- alerts
- dialogs
- command palettes
- breadcrumbs
- pagination
- charts
- skeletons

Do not let each page invent its own visual language.

Build composable primitives.

Avoid giant monolithic components.

Avoid duplicated page-specific versions of the same control.

Create consistent interaction states:

- loading
- disabled
- dirty
- saving
- saved
- error
- success
- partial
- unavailable

Configuration UX should clearly distinguish:

    live state
    pending local state
    saved state
    failed state

============================================================
10. RPC ARCHITECTURE
============================================================

The RPC contract is a critical architectural boundary.

Audit every existing action.

Find:

- duplicate actions
- actions returning too much data
- actions returning too little data
- inconsistent errors
- inconsistent pagination
- inconsistent naming
- duplicated serialization
- duplicated validation
- dashboard-only domain logic
- worker-only accidental coupling

Do NOT casually create dozens of tiny RPC actions.

Prefer coherent domain-oriented contracts.

However, do not create giant god-actions either.

Keep contracts:

- typed
- explicit
- versionable
- predictable
- efficient
- easy to test

The dashboard must continue to communicate with the worker through the intended boundary.

The dashboard must NOT gain direct Prisma/Redis access.

============================================================
11. DATA / DATABASE
============================================================

Audit Prisma usage.

Find:

- N+1 queries
- unnecessary fetches
- over-fetching
- repeated transactions
- unnecessary writes
- race conditions
- missing indexes
- accidental full-table reads
- serialization waste
- duplicate query helpers

Use:

    container.db

according to project conventions.

Do not bypass the database abstraction without a strong architectural reason.

Use transactions when correctness demands them.

Make concurrency behavior explicit.

Think about:

- multiple shards
- concurrent dashboard writes
- duplicate interactions
- retries
- worker restarts
- scheduled task races
- stale dashboard state

============================================================
12. REDIS / CACHE / QUEUES
============================================================

Audit all Redis usage.

Find:

- duplicated keys
- inconsistent TTLs
- raw redis.del usage
- cache stampedes
- stale cache windows
- unnecessary caching
- missing invalidation
- unbounded keys
- inefficient serialization

Use the existing invalidation infrastructure.

Audit BullMQ usage:

- retries
- idempotency
- concurrency
- backoff
- stalled jobs
- duplicate jobs
- shutdown behavior
- primary shard behavior
- failure recovery

A scheduled task must be safe under retries and process restarts.

============================================================
13. SHARDING
============================================================

Treat sharding as a real distributed system.

Assume:

- events can arrive concurrently
- shards can restart independently
- network calls can fail
- Discord can rate limit
- Redis can be temporarily unavailable
- PostgreSQL can be slow
- primary shard can disappear
- jobs can be retried

Audit:

- primary election assumptions
- scheduling ownership
- event propagation
- RPC exposure
- metrics
- shard telemetry
- cache invalidation
- duplicate work
- race conditions

Do not introduce a second custom sharding system where discord.js already provides one.

============================================================
14. OBSERVABILITY
============================================================

Keep and improve observability.

Audit:

- traces
- metrics
- logs
- health checks
- readiness checks
- shard metrics
- RPC metrics
- database timings
- queue metrics
- Discord API failures

Every important operation should be diagnosable.

The operator should be able to answer:

    Is Lumi healthy?
    Which shard is unhealthy?
    What is slow?
    What is failing?
    Why?
    Since when?
    How often?

Do not add telemetry everywhere blindly.

Make telemetry useful.

============================================================
15. PERFORMANCE
============================================================

Profile before optimizing.

Look for:

- synchronous work on hot paths
- repeated API calls
- repeated serialization
- unnecessary object creation
- oversized payloads
- excessive React renders
- dashboard waterfall requests
- inefficient database queries
- expensive event listeners
- excessive Redis round trips
- redundant Discord fetches

Optimize real bottlenecks.

Do not destroy readability for theoretical micro-optimizations.

Benchmark meaningful operations where possible.

============================================================
16. TESTING
============================================================

Expand testing significantly.

We need tests for:

- command behavior
- permission behavior
- configuration
- module lifecycle
- RPC contracts
- validation
- database logic
- cache invalidation
- scheduled tasks
- retries
- race conditions
- pagination
- autocomplete
- dashboard components
- destructive actions
- empty states
- error states
- loading states

Add edge-case tests.

Specifically test:

- missing guild
- deleted channel
- deleted role
- deleted user
- missing permissions
- bot lacking permissions
- Discord API errors
- timeouts
- rate limits
- duplicate interactions
- stale configuration
- concurrent updates
- shard restart
- Redis outage
- database outage
- malformed input
- extremely large input
- empty datasets
- maximum pagination boundaries
- maximum Discord API limits

Test overload where practical.

Do not simply increase coverage numbers.

Tests must represent actual failure modes.

============================================================
17. PROPERTY / INVARIANT THINKING
============================================================

For important infrastructure, identify invariants.

Examples:

- a permission check must never accidentally broaden access
- a scheduled task must not execute twice when idempotency forbids it
- cache invalidation must eventually remove stale state
- dashboard writes must not silently overwrite newer state
- pagination must never skip or duplicate items
- command execution must handle duplicate interaction delivery safely

Write tests around these invariants.

============================================================
18. DOCUMENTATION — REBUILD IT
============================================================

Documentation is part of the product.

Re-audit all docs.

The documentation should be sufficient for:

    a new contributor
    a module author
    an addon author
    a dashboard developer
    an operator
    someone deploying Lumi
    someone debugging Lumi
    someone integrating with Lumi

Create/update:

- getting started
- architecture
- module development
- addon development
- commands
- permissions
- RPC
- dashboard architecture
- dashboard component system
- scheduling
- events
- sharding
- database
- Redis
- observability
- testing
- deployment
- troubleshooting
- operations
- configuration reference
- API reference
- contribution guide

Use examples.

Explain WHY, not just WHAT.

Every architectural boundary should have a reason.

Eliminate stale documentation.

Never leave docs describing deleted architecture.

============================================================
19. DOCUMENTATION QUALITY BAR
============================================================

A documentation page is incomplete if a developer still needs to inspect source code to understand the normal use case.

Examples must be:

- current
- runnable
- type-correct
- minimal
- idiomatic

Use generated API documentation when appropriate.

Make the docs website visually excellent too.

Treat docs as another polished Lumi product surface.

============================================================
20. CODE QUALITY
============================================================

Improve naming.

Remove ambiguous names.

Remove giant files where boundaries are unclear.

But DO NOT split files merely to make line counts smaller.

A file should represent a coherent concept.

Prefer:

- small focused functions
- explicit types
- predictable control flow
- early validation
- centralized domain rules
- boring infrastructure
- composable primitives

Avoid:

- premature abstractions
- abstraction for abstraction's sake
- five layers of indirection
- "ManagerManagerService"
- generic god-services
- `utils.ts` dumping grounds
- giant conditional trees
- repeated try/catch boilerplate

============================================================
21. SECURITY
============================================================

Audit:

- permission boundaries
- RPC authentication
- dashboard authorization
- guild ownership/management checks
- addon boundaries
- secret handling
- webhook validation
- user-controlled IDs
- injection surfaces
- unsafe command execution
- privilege escalation
- CSRF / session boundaries
- SSRF-like server-side fetch risks
- rate limits

Do not sacrifice security for convenience.

============================================================
22. BACKWARD COMPATIBILITY
============================================================

This is alpha.

Internal compatibility is NOT sacred.

Prefer a clean migration over years of compatibility hacks.

However:

- preserve user-facing functionality
- provide migrations when data structures change
- update docs
- update tests
- update dashboard contracts
- update addons where possible
- explicitly document breaking architectural changes

Do not leave half-migrated architecture.

============================================================
23. WORKFLOW
============================================================

Use the Nix development environment.

You have access to:

    nix develop
    nix shell
    project devshell tools

Use them properly.

Do not install random global dependencies when the repository/devenv can provide them.

Inspect the existing .env/development environment where available, but NEVER leak secrets.

Use realistic local infrastructure when available.

Run:

    bun run typecheck
    bun run lint
    bun run test

and all relevant dashboard/package-specific checks.

You may add better validation commands if useful.

Run tests frequently during migration.

============================================================
24. IMPLEMENTATION STRATEGY
============================================================

Do NOT rewrite the entire repository blindly in one pass.

Proceed in coherent waves.

~~Wave 1:~~ DONE — recon completed, scoped down to a cleanup/consolidation pass (see /home/rebiz/.claude/plans/jazzy-rolling-pinwheel.md); full rewrite deemed unwarranted.
    ~~architecture audit~~ done
    ~~dependency audit~~ done
    ~~dead-code audit~~ done (Wave 1 of scoped plan: removed apps/docs/.astro/, fixed stale AGENTS.md links)
    ~~framework capability audit~~ done

~~Wave 2:~~ DONE — command-response.ts errorCard/makeErrorCard naming collision resolved (renamed to buildCommandErrorCard). Audited packages/core for reinvented Sapphire/discord.js functionality (plan.md §2/§4): codebase is largely idiomatic; found and deleted 2 genuinely dead files (src/lib/listeners/chatInputCommandDenied.ts, chatInputCommandError.ts — unreferenced, superseded by factory-generated equivalents in modules/core/listeners/commands/). No other high-confidence bloat found (preconditions, PrefixCache, command registry, cooldowns, permission utilities all verified as legitimate domain logic, not reinvention). Verified via typecheck/lint/1092 tests green.
    core infrastructure simplification

~~Wave 3:~~ DONE — audited module architecture (§5: zero empty dirs/ceremony across all 9 modules, no services/ layer exists) and command system (§6: sampled ~25 commands across 5 modules). purge.ts/permit.ts's size (609/506 lines) is inherent to their feature scope, not bloat. Found and fixed one real duplication: permit.ts had 6 near-identical try/catch/logError/replyError blocks across create/delete/nodesAdd/nodesRemove/assign/unassign — hoisted into a private runPermitOp() helper (~30 lines removed, no behavior change). Verified via typecheck/lint/1092 tests green.
    command/module system cleanup

Wave 4:
    Discord UX system

~~Wave 5:~~ CHECKED — investigated core-rpc.ts (~20 handlers): all already funnel through dispatchRpc's single centralized tracing/error-normalization/logging path (dispatch.ts). No per-handler duplication exists to extract. No change needed.
    RPC cleanup

Wave 6:
    dashboard design system

Wave 7:
    dashboard information architecture + pages

Wave 8:
    performance/concurrency/reliability

Wave 9:
    tests

Wave 10:
    documentation

Wave 11:
    final cleanup

After every major wave:

    typecheck
    lint
    tests

Do not allow errors to accumulate for hundreds of files.

============================================================
25. DECISION AUTHORITY
============================================================

You have broad free-hand authority.

You MAY:

- rename files
- move files
- delete files
- merge files
- split files
- replace abstractions
- change interfaces
- change contracts
- redesign UI
- rewrite components
- change implementation strategies
- replace homemade infrastructure with framework features
- introduce better dependencies when justified
- remove dependencies that are no longer justified
- change internal architecture

You SHOULD do these things when they materially improve the codebase.

Do NOT ask me for permission for ordinary engineering decisions.

ASK ME only when:

1. There are two materially different product directions and neither is clearly superior.
2. A decision would intentionally remove a user-facing capability.
3. A migration requires destructive data loss that cannot be safely migrated.
4. A requirement is genuinely ambiguous and cannot be inferred from repository behavior/docs.
5. There is a major architectural tradeoff with significant long-term consequences and no clear winner.

Otherwise:

    make the decision
    implement it
    test it
    document it

============================================================
26. "BEST POSSIBLE LUMI" STANDARD
============================================================

When reviewing any piece of code ask:

    Would I build this today?

    Does the framework already do this?

    Is this abstraction earning its existence?

    Can this be simpler?

    Can this fail under concurrency?

    Can this be easier to test?

    Can this be easier to operate?

    Can this be easier to understand six months from now?

    Can the user accomplish the same task in fewer clicks?

    Does the UI communicate state clearly?

    Would a new contributor understand this?

If the answer is no:

    improve it.

============================================================
27. FINAL ACCEPTANCE CRITERIA
============================================================

Do not consider the work complete until:

- functionality is preserved
- architecture is simpler
- duplicate infrastructure is reduced
- Sapphire/discord.js are used effectively
- module boundaries are clean
- command code is cleaner
- Discord UX is consistent
- dashboard UX is dramatically improved
- dashboard responsive behavior is good
- RPC contracts are coherent
- concurrency behavior is tested
- failure paths are tested
- overload/edge cases are covered
- performance bottlenecks are addressed
- observability remains strong or improves
- docs are synchronized with reality
- dead code is removed
- dependencies are justified
- typecheck passes
- lint passes
- tests pass
- dashboard tests pass
- migrations, if any, are safe and documented
- there are no obvious half-migrated systems

At the end produce:

    1. Architecture changes
    2. Deleted/replaced abstractions
    3. Sapphire/discord.js functionality adopted
    4. Dashboard redesign summary
    5. Discord UX improvements
    6. Performance improvements
    7. Reliability/concurrency improvements
    8. Test coverage added
    9. Documentation added/rewritten
    10. Breaking changes
    11. Migration requirements
    12. Remaining technical debt
    13. Validation results

Also produce a concise "before vs after" architecture diagram.

============================================================
28. IMPORTANT MINDSET
============================================================

Do not optimize for:

    "minimum diff"

Optimize for:

    "best codebase after the alpha rewrite"

Do not optimize for:

    "keeping everything familiar"

Optimize for:

    "making the system obvious"

Do not optimize for:

    "preserving abstractions"

Optimize for:

    "preserving behavior"

Do not optimize for:

    "adding more code"

Optimize for:

    "achieving more with less code"

This is a product-quality and architecture pass, not a cosmetic refactor.

BE RUTHLESS.

KEEP THE FUNCTIONALITY.

DELETE THE BULLSHIT.

USE THE FRAMEWORK.

MAKE THE PRODUCT FEEL EXPENSIVE.

MAKE THE CODEBASE FEEL OBVIOUS.

============================================================
START
============================================================

1. Read AGENTS.md and all core docs.
2. Inspect the repository completely.
3. Build the architecture/dependency map.
4. Create PLAN.md.
5. Identify the highest-value architectural simplifications.
6. Begin implementation.
7. Continuously test.
8. Rework rather than patch when the architecture demands it.
9. Keep docs synchronized.
10. Finish only when the acceptance criteria are satisfied.

Do not stop after producing a plan.

PLAN -> IMPLEMENT -> TEST -> REASSESS -> REWRITE -> DOCUMENT -> VERIFY.
make dashboard and docs webst=ite sexy too and make a todo first and use a fleet of subagents and reviewers just like how bun rewrotr from zig to rust
