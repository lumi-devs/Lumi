import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startRpcHttpServer } from "#lib/rpc/http-server.js";
import { ReadinessProbes } from "#lib/client/ReadinessProbes.js";
import { runReadinessProbes } from "@lumi/observability";

describe("Chaos Suite: Shard 0 SIGKILL Respawn & RPC Re-bind", () => {
  const originalBun = (globalThis as any).Bun;
  const originalRpcToken = process.env.RPC_INTERNAL_TOKEN;

  beforeEach(() => {
    process.env.RPC_INTERNAL_TOKEN = "test-secret-token";
  });

  afterEach(() => {
    (globalThis as any).Bun = originalBun;
    if (originalRpcToken !== undefined) {
      process.env.RPC_INTERNAL_TOKEN = originalRpcToken;
    } else {
      delete process.env.RPC_INTERNAL_TOKEN;
    }
  });

  it("retries port binding on EADDRINUSE and succeeds once orphaned socket clears", async () => {
    let attemptCount = 0;
    const mockServer = {
      stop: vi.fn(),
    };

    (globalThis as any).Bun = {
      serve: vi.fn((_opts: any) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("EADDRINUSE: Address already in use");
        }
        return mockServer;
      }),
    };

    const logger = vi.fn();
    const serverHandle = await startRpcHttpServer(logger, 3, 10);

    expect(serverHandle).toBe(mockServer);
    expect(attemptCount).toBe(2);
    expect(logger).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("Failed to bind internal RPC HTTP server on attempt 1/3"),
      expect.objectContaining({
        error: expect.stringContaining("EADDRINUSE"),
      }),
    );
    expect(logger).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("Internal RPC HTTP server listening"),
      expect.objectContaining({ authenticated: true }),
    );
  });

  it("reflects RPC unreadiness during probe checks when RPC server is starting up", async () => {
    let rpcReady = false;
    const probe = new ReadinessProbes({
      isReady: () => true,
      isRpcReady: () => rpcReady,
    });

    probe.register();

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
