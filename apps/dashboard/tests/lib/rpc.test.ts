import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RpcResponse } from "@lumi/contracts";

// lib/rpc.ts also imports `#/lib/env` (for the `getRpcClient()`/`rpcCall()`
// convenience wrappers) — env.ts throws at *module load* time if
// RPC_HTTP_URL etc. aren't set, which they deliberately aren't in a unit
// test environment. `RpcClient` itself doesn't read `env`, but importing
// the module would still throw without this.
vi.mock("#/lib/env", () => ({
  env: { rpcHttpUrl: "http://worker:8091" },
}));

const { RpcClient } = await import("#/lib/rpc");

function jsonResponse(body: RpcResponse, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("RpcClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the request to <baseUrl>/rpc with action/guildId/actorId/data in the body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "unused", ok: true, data: { success: true } }),
    );

    const client = new RpcClient("http://worker:8091");
    await client.call("guild.module.toggle", {
      guildId: "101",
      actorId: "1",
      data: { moduleName: "afk", enabled: false },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://worker:8091/rpc",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = fetchMock.mock.calls[0]!;
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      action: "guild.module.toggle",
      guildId: "101",
      actorId: "1",
      data: { moduleName: "afk", enabled: false },
    });
  });

  it("resolves call() with response.data on a successful reply", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "unused", ok: true, data: { name: "My Guild" } }),
    );

    const client = new RpcClient("http://worker:8091");
    await expect(
      client.call("guild.dashboard.get", { guildId: "101", actorId: "1" }),
    ).resolves.toEqual({ name: "My Guild" });
  });

  it("rejects with the server's error message when the reply has ok: false", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: "unused",
        ok: false,
        error: "Guild not found in bot cache",
      }),
    );

    const client = new RpcClient("http://worker:8091");
    await expect(
      client.call("guild.dashboard.get", { guildId: "101" }),
    ).rejects.toThrow("Guild not found in bot cache");
  });

  it("rejects with a generic error when ok: false but no error message is given", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "unused", ok: false }));

    const client = new RpcClient("http://worker:8091");
    await expect(
      client.call("guild.dashboard.get", { guildId: "101" }),
    ).rejects.toThrow("RPC error");
  });

  it("times out and rejects if the request takes longer than timeoutMs", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const client = new RpcClient("http://worker:8091");
    await expect(
      client.call("guild.dashboard.get", { guildId: "101", timeoutMs: 15 }),
    ).rejects.toThrow("RPC timed out: guild.dashboard.get");
  });

  it("rejects immediately if fetch itself fails (worker unreachable)", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const client = new RpcClient("http://worker:8091");
    await expect(
      client.call("guild.dashboard.get", { guildId: "101" }),
    ).rejects.toThrow("connect ECONNREFUSED");
  });

  it("throws when the response body isn't valid JSON, logging instead", async () => {
    const log = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error("Unexpected token")),
    } as unknown as Response);

    const client = new RpcClient("http://worker:8091", log);
    await expect(
      client.call("guild.dashboard.get", { guildId: "101" }),
    ).rejects.toThrow("malformed response");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Discarding undecodable RPC response"),
    );
  });

  describe("healthy()", () => {
    it("reflects the /healthz response status", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true } as Response);
      const client = new RpcClient("http://worker:8091");
      await expect(client.healthy()).resolves.toBe(true);
      expect(fetchMock).toHaveBeenCalledWith("http://worker:8091/healthz");
    });

    it("returns false when the worker is unreachable", async () => {
      fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
      const client = new RpcClient("http://worker:8091");
      await expect(client.healthy()).resolves.toBe(false);
    });
  });
});
