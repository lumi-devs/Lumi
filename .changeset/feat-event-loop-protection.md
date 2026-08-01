---
"@lumi/core": minor
"@lumi/observability": minor
---

Protect the event loop from guild-controlled work. Filter regex now runs in a `node:worker_threads` worker (`lib/regex-worker/`) with a hard per-evaluation timeout, restart-on-hang, and automatic disabling of the offending pattern; patterns are probed against adversarial inputs when saved, so catastrophic backtracking is rejected at config time rather than discovered on the message path. Fire-and-forget sends (mod-log entries, security alerts, logging cards) move onto the BullMQ `send-message` task with one in-flight send per channel, so a Discord outage or a rate-limited log channel delays them instead of losing them or blocking a handler; interaction replies stay inline. Adds `lumi_event_loop_delay_seconds` (p50/p99/max) and a `container.configValueValidators` hook for pre-write config validation.
