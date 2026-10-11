import { describe, it, expect } from "bun:test";
import { registerRpcReadinessProbe } from "#src/lib/client/ReadinessProbes.js";
import { runReadinessProbes } from "#src/observability/Index.ts";

describe("Chaos Suite: Shard 0 SIGKILL Respawn & RPC Re-bind", () => {
  it("reflects RPC unreadiness during probe checks when RPC server is starting up", async () => {
    let rpcReady = false;
    registerRpcReadinessProbe(() => rpcReady);

    const initialReport = await runReadinessProbes();
    expect(initialReport.checks["rpc-server"]).toEqual({
      status: "fail",
      detail: "rpc server not running",
    });

    rpcReady = true;
    const readyReport = await runReadinessProbes();
    expect(readyReport.checks["rpc-server"]).toEqual({
      status: "ok",
    });
  });
});
