---
"@lumi/core": minor
"@lumi/shared": patch
"@lumi/contracts": minor
---

Run every addon in a V8 isolate inside a Node sidecar instead of a Bun child process. The isolate has no filesystem, network, subprocess, or process access at all - addon code reaches the host only through the capability-gated RPC bridge, with per-isolate memory limits and CPU timeouts. New mediated RPC methods: `util.randomHex`/`util.sha256Hex`/`util.sleep` (always allowed, pure compute) and SSRF-guarded `net.fetch` (new `network` manifest capability, exposed as `lumi/net`). The addon SDK transport is now injected (`setRpcTransport`) so one RPC module serves both runtimes, card-color and error helpers moved to dependency-free homes (`#lib/discord/constants`, `#lib/branding/colors`, `@lumi/shared`), and `Bun.spawn` mocks in resolver tests are scoped per-test so later suites can spawn real processes. The dashboard RPC client now retries server-directed retryable failures (honoring `retryAfterMs`) and caps response bodies. Docker images install Node.js and compile the isolated-vm binding in the deps stage.
