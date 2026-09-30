# 0008: One BullMQ queue with priorities, not per-tier queues

Status: Accepted

## Context

Scheduled work spans very different urgency tiers — a time-critical unmute
firing on schedule versus a routine cleanup sweep — and `apps/scheduler`
needed a way to make urgent jobs jump the line without urgent jobs starving
under a backlog of routine ones. Separate queues per tier is the usual
answer, but it means the scheduler has to fan out across N queues, N sets of
repeatable-job registrations, and N Redis key namespaces for what is, in
practice, a total ordering problem.

## Decision

A single shared BullMQ queue backs all scheduled tasks, ordered by an
explicit `priority` field rather than by which queue a job landed in:
`QueuePriority` (`packages/core/src/lib/schedule-task.ts`) defines
`CRITICAL: 1`, `UTILITY: 5`, `CLEANUP: 10` (lower runs sooner).

BullMQ's own semantics forced one specific default: a job with no `priority`
set is not neutral — BullMQ always drains its unprioritized wait list ahead
of the entire prioritized set, so an unprioritized job would jump ahead of
even `CRITICAL`. `SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS`
(`#lib/client/scheduled-tasks-queue.js`) defaults every job's `priority` to
`UTILITY` for exactly this reason — a call site only needs to touch this
default when it wants to move a job *off* `UTILITY`, never to opt into
prioritization at all.

## Consequences

One queue means one set of repeatable-job registrations, one cluster-wide
scheduler lock, and one Redis key namespace to reason about — at the cost of
every job needing to pick the right priority rather than getting isolation
for free by queue choice. The BullMQ default-priority trap (unprioritized
jobs bypass CRITICAL) is exactly the kind of thing that would silently
reintroduce a starvation bug if a future job type is added without going
through `SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS`.
