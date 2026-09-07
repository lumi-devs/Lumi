---
'@lumi/contracts': minor
'@lumi/core': patch
'@lumi/dashboard': patch
'@lumi/observability': patch
---

Consolidate shared contracts and fix the offline test suite: single-source permit nodes, `RpcResponsePayloads` end-to-end RPC typing with all dashboard view types moved into `@lumi/contracts`, strict `parseRpcResponse` envelope checks, `Bun`-global test shims plus a `#lib/runtime` seam so the full suite passes outside the Bun runtime, permit-chain quarantine MGET fold-in, isolated regex probe worker, bounded dashboard member sampling, moderation-case serialization retries, RPC helpers promoted to `#lib/rpc`, and dev-only HMR/pretty-logger dependencies
