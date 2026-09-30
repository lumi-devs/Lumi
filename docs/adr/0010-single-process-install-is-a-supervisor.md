# 0010: Single-process install is a supervisor, not one address space

Status: Accepted

## Context

ADR 0001 split the bot into three independently deployable processes
(`worker`, `api`, `scheduler`). Most self-hosters still want to run "the
bot" as one command, and the obvious-looking shortcut would be to bootstrap
all three inside a single Node/Bun process to give them exactly that.

## Decision

`lumi start all` (`apps/cli/src/commands/start.ts`) runs a small supervisor
instead: it spawns `worker`, `api` and `scheduler` as three separate OS
processes (`Bun.spawn(["bun", entryFor(target)], ...)`), prefixes every line
of their output with `[worker]`/`[api]`/`[scheduler]`, forwards
`SIGINT`/`SIGTERM` to all three, and — if any one exits non-zero — terminates
the other two and exits non-zero itself.

The CLI's own help text states the reason directly: each of `worker`/`api`/
`scheduler` bootstraps its own `@sapphire/framework` `container` — the
process-wide singleton core hangs DB/Redis/client access off — and running
all three bootstraps in one process would have the second and third
overwrite the first's container. So `lumi start all` stays three processes
under one command, not truly one address space.

## Consequences

A single-process install still gets one command and one supervised lifecycle
(`lumi start all`), while each of the three retains the process isolation
ADR 0001 relies on — a crash in one doesn't corrupt another's container
state, and the supervisor's fail-one-kill-all behavior surfaces that
immediately instead of leaving two zombie processes running against a dead
third. The cost is three OS processes and three sets of connections
(DB/Redis) even for the smallest single-guild deployment, which is the
deliberate trade for not having to make the container itself
multi-instantiable.
