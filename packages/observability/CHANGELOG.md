# @lumi/observability

## 3.2.0

## 3.1.1

## 3.1.0

### Patch Changes

- 82137ab: Relicense the core bot library and infrastructure packages from AGPL-3.0-only to GPL-3.0-only; first-party addons in lumi-addons remain AGPL-3.0-only. GPLv3 §13 / AGPLv3 §13 explicitly permit combining GPL and AGPL-licensed works, so third-party addons can keep depending on and importing the core SDK surface across the license boundary.

## 3.0.0

### Minor Changes

- 70337e8: Protect the event loop from guild-controlled work. Filter regex now runs in a `node:worker_threads` worker (`lib/regex-worker/`) with a hard per-evaluation timeout, restart-on-hang, and automatic disabling of the offending pattern; patterns are probed against adversarial inputs when saved, so catastrophic backtracking is rejected at config time rather than discovered on the message path. Fire-and-forget sends (mod-log entries, security alerts, logging cards) move onto the BullMQ `send-message` task with one in-flight send per channel, so a Discord outage or a rate-limited log channel delays them instead of losing them or blocking a handler; interaction replies stay inline. Adds `lumi_event_loop_delay_seconds` (p50/p99/max) and a `container.configValueValidators` hook for pre-write config validation.

## 1.0.1

### Patch Changes

- 40741cc: Add project hygiene, Changesets release automation, pre-commit hooks, and documentation fact-checking across workspace packages.
