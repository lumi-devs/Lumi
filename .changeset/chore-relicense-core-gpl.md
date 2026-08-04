---
"@lumi/core": patch
"@lumi/contracts": patch
"@lumi/event-bus": patch
"@lumi/observability": patch
"@lumi/sharding": patch
"@lumi/dashboard": patch
"@lumi/worker": patch
"@lumi/scheduler": patch
---

Relicense the core bot library and infrastructure packages from AGPL-3.0-only to GPL-3.0-only; first-party addons in lumi-addons remain AGPL-3.0-only. GPLv3 §13 / AGPLv3 §13 explicitly permit combining GPL and AGPL-licensed works, so third-party addons can keep depending on and importing the core SDK surface across the license boundary.
