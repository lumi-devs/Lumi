import { describe, it, expect } from "bun:test";
import { registerRpcReadinessProbe } from "#lib/client/ReadinessProbes.js";
import { runReadinessProbes } from "@lumi/observability";

// The RPC HTTP server's own bind-retry/EADDRINUSE chaos test lives with the
// transport in apps/api/tests/rpc-http-server.test.ts now that
// startRpcHttpServer moved to apps/api/src/rpc-http-server.ts.
describe("Chaos Suite: Shard 0 SIGKILL Respawn & RPC Re-bind", () => {
  it("reflects RPC unreadiness during probe checks when RPC server is starting up", async () => {
    let rpcReady = false;
    registerRpcReadinessProbe(() => rpcReady);

    // Check readiness before RPC server binds
    const initialReport = await runReadinessProbes();
    expect(initialReport.checks["rpc-server"]).toEqual({
      status: "fail",
      detail: "rpc server not running",
    });

    // RPC becomes ready
    rpcReady = true;
    const readyReport = await runReadinessProbes();
    expect(readyReport.checks["rpc-server"]).toEqual({
      status: "ok",
    });
  });
});
