# Graduated Automod

## What already exists

`packages/core/src/modules/filter/` has a full heat system:

- `heat.ts` — per-message heat accumulation (per-mention, per-emoji, per-link, per-duplicate, etc.)
- Heat thresholds already map to actions: `heat_warn`, `heat_timeout`, `heat_quarantine`
- `auto-lockdown-handler.ts` — lockdown trigger on mention spam
- `mod/index.ts` has `warn_thresholds` JSON map (warn count → mute/ban/kick + duration)

So **tiered escalation already exists** for two paths: heat score → action, and warn count → action.

## What's missing vs Sapphire's pattern

Sapphire's "graduated automod" = **per-rule punishment mapping**:
- Spam filter hit → warn
- Invite block hit → mute 10m
- Link block hit → kick
- Repeated filter hit within 24h → escalate to next tier

Currently in Lumi: all filter rules produce the same punishment (whatever `heat_warn`/`heat_timeout` thresholds say).

**ASK:**
1. Is per-rule punishment the missing piece, or is there something else you had in mind?
2. Should this be a new `automod` module or extend `filter/index.ts` config schema?
3. Separate from heat: do you want a "strike counter" (N filter hits in T minutes → escalate), independent of heat score?

## Proposed addition (if answer to #1 is yes)

Extend `filter/index.ts` config schema with per-rule-group punishment overrides:

```ts
spam_punishment:   cfg.select({ options: ["warn","timeout","quarantine","kick","ban"] })
spam_duration:     cfg.string({ label: "Timeout Duration", ... })
invite_punishment: cfg.select(...)
link_punishment:   cfg.select(...)
term_punishment:   cfg.select(...)
```

Each rule group fires its configured punishment instead of contributing to the heat pool.

## Files to touch

1. `packages/core/src/modules/filter/index.ts` — add per-rule punishment fields to schema
2. `packages/core/src/modules/filter/lib/enforce.ts` — read per-rule punishment instead of global heat action
3. `packages/core/src/modules/filter/lib/rules.ts` — pass rule-group context through to enforce
