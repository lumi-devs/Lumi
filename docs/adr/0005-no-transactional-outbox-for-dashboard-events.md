# 0005: No transactional outbox: dashboard events are a best-effort hint

Status: Accepted

## Context

The dashboard wants near-real-time updates when config changes or a module
is toggled elsewhere (another admin, a Discord command). A fully durable
"never miss an event" design would need a transactional outbox: write the
event in the same database transaction as the mutation, then a relay process
publishing outbox rows reliably, with replay/backfill for consumers that
missed a gap. That's real infrastructure for a feature whose only job is
refreshing a UI a human is looking at.

## Decision

Dashboard-facing events (`ModuleStateChangedEvent`, `ConfigChangedEvent`,
`packages/contracts/src/events.ts`) are published directly onto a Redis
Streams event bus (`packages/core/src/lib/event-bus/`) at the single mutation
site each one represents, and consumed by `apps/api`'s SSE endpoint
(`packages/core/src/lib/rpc/sse-server.ts`). All events share one stream
(`DashboardEventStream = "lumi:dashboard-events"`) rather than one per event
type, since each SSE connection already pays a Redis round-trip per
`XREADGROUP` with its own ephemeral consumer group — splitting by type buys
nothing at today's volume.

The source comment on `events.ts` states the contract explicitly: "these
events are a best-effort live-UI hint, not a durable audit trail — the
database stays the source of truth for everything they describe."

## Consequences

A missed event (a dropped SSE connection, a brief Redis blip) means the
dashboard shows stale state until the next full read, not silent data loss —
because nothing that matters is *only* recorded in this stream. This keeps
the dashboard's live-update path cheap and simple. It means the event bus
must never become the only place a fact is recorded; any consumer that needs
durability or replay has to read the real source of truth
(Postgres/`container.db`) instead of trusting the stream.
