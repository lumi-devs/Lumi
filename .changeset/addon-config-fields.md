---
"@lumi/contracts": patch
"@lumi/core": patch
---

Ship addon `configFields` over the sandbox `ready` handshake and merge them into the host module record, so addons render the same config UI as built-in modules in the Discord hub panel and dashboard. Previously the host only ever saw the manifest's (usually empty) `configFields` while the real schema lived in the child process.
