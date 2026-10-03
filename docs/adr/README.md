# Architecture Decision Records

Short records of decisions that shape Lumi's architecture — the ones a new
contributor would otherwise have to reconstruct from git history or ask
about. Each one is grounded in the actual source (file paths, not vibes) and
kept short: 15-40 lines, factual, no marketing.

Not every decision belongs here — only ones that are (a) genuinely
consequential to how the system is shaped, and (b) non-obvious enough that
someone will plausibly propose reversing them without knowing why they were
made. Routine refactors, naming choices, and anything that's just "the code
is the doc" don't need an ADR.

## Index

| # | Title | Status |
| :--- | :--- | :--- |
| [0001](0001-gateway-free-api-and-scheduler-processes.md) | Gateway-free `api` and `scheduler` processes | Accepted |
| [0002](0002-typed-http-rpc-over-a-contracts-router.md) | Typed HTTP RPC over a contracts router, not tRPC/gRPC | Accepted |
| [0003](0003-dashboard-in-a-separate-repo.md) | Dashboard lives in a separate repo, consuming published contracts | Accepted |
| [0004](0004-addon-process-isolation-and-signed-revisions.md) | Addon process isolation, pinned revisions and SSH commit signing | Accepted |
| [0005](0005-no-transactional-outbox-for-dashboard-events.md) | No transactional outbox: dashboard events are a best-effort hint | Accepted |
| [0006](0006-explicit-cache-invalidation-not-event-driven.md) | Cache invalidation stays explicit via `InvalidationBus` | Accepted |
| [0007](0007-retention-and-archive-over-table-partitioning.md) | Data growth: retention + archive, not native table partitioning | Accepted |
| [0008](0008-one-bullmq-queue-with-priorities.md) | One BullMQ queue with priorities, not per-tier queues | Accepted |
| [0009](0009-no-changesets-lockstep-contracts-release.md) | No Changesets: contracts and observability release in lockstep | Accepted |
| [0010](0010-single-process-install-is-a-supervisor.md) | Single-process install is a supervisor, not one address space | Accepted |
| [0011](0011-single-authorization-evaluator.md) | One `authorize()` evaluator for commands, RPC and the addon SDK | Accepted |
| [0012](0012-feature-flags-hash-rollout-not-sticky-bucketing.md) | Feature-flag rollout buckets a stable hash, not a stored assignment | Accepted |

## Adding a new ADR

Copy the template below into a new file named `NNNN-kebab-case-title.md`
(next sequential number, zero-padded to 4 digits), fill it in, and add a row
to the index above.

```markdown
# NNNN: Title

Status: Proposed | Accepted | Superseded by NNNN | Deprecated

## Context

What situation forced this decision? What were the constraints? Cite the
actual code/commits this grew out of, not a hypothetical.

## Decision

What was decided, stated plainly. Name the concrete files/modules involved.

## Consequences

What this makes easy, what it makes hard, and what would have to change to
revisit it.
```
