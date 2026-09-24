import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import type { RpcResponse } from "@lumi/contracts/rpc";
import { rpcRouter } from "@lumi/contracts/rpc";

// lib/rpc.ts also imports `#/lib/env` (for the `getRpcClient()` convenience
// wrapper, which this file doesn't exercise) — real env.ts has dev-safe
// defaults for every field it reads, so it's fine to import for real rather
// than mock (mocking it here would leak into every other test file too,
// since bun:test's module mocks are process-wide, not per-file).
const { RpcClient, isGuildMissing, RpcError } = await import("#/lib/rpc");

function jsonResponse(body: RpcResponse, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("RpcClient", () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts the request to <baseUrl>/rpc with action/guildId/actorId/data in the body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "unused", ok: true, data: { success: true } }),
    );

    const client = new RpcClient("http://worker:8091");
    await client.invoke("guild.module.toggle", {
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

  it("sends the internal token as a bearer header when one is configured", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "unused", ok: true, data: {} }),
    );

    const client = new RpcClient("http://worker:8091", "s3cret");
    await client.invoke("guild.shell.get", { guildId: "101", actorId: "1" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers).toMatchObject({ authorization: "Bearer s3cret" });
  });

  it("omits the bearer header when no token is configured", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "unused", ok: true, data: {} }),
    );

    const client = new RpcClient("http://worker:8091");
    await client.invoke("guild.shell.get", { guildId: "101", actorId: "1" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers).not.toHaveProperty("authorization");
  });

  it("maps an aborted fetch to a TIMEOUT RpcError", async () => {
    fetchMock.mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const client = new RpcClient("http://worker:8091");
    await expect(
      client.invoke("guild.shell.get", { guildId: "101", actorId: "1" }),
    ).rejects.toThrow("RPC timed out: guild.shell.get");
  });

  it("rejects immediately if fetch itself fails (worker unreachable)", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const client = new RpcClient("http://worker:8091");
    await expect(
      client.invoke("guild.shell.get", { guildId: "101", actorId: "1" }),
    ).rejects.toThrow("connect ECONNREFUSED");
  });

  it("throws when the response body isn't valid JSON, logging instead", async () => {
    const log = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error("Unexpected token")),
    } as unknown as Response);

    const client = new RpcClient("http://worker:8091", "", log);
    await expect(
      client.invoke("guild.shell.get", { guildId: "101", actorId: "1" }),
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
      expect(fetchMock).toHaveBeenCalledWith(
        "http://worker:8091/healthz",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns false when the worker is unreachable", async () => {
      fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
      const client = new RpcClient("http://worker:8091");
      await expect(client.healthy()).resolves.toBe(false);
    });
  });

  describe("RpcClient.invoke", () => {
    it("posts action/guildId/actorId/data", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ id: "x", ok: true, data: { module: null } }),
      );

      const client = new RpcClient("http://worker:8091");
      await expect(
        client.invoke("guild.module.get", {
          guildId: "101",
          actorId: "1",
          data: { module: "afk" },
        }),
      ).resolves.toMatchObject({ module: null });

      const [, init] = fetchMock.mock.calls[0]!;
      const sent = JSON.parse(init.body as string);
      expect(sent).toMatchObject({
        action: "guild.module.get",
        guildId: "101",
        actorId: "1",
        data: { module: "afk" },
      });
    });

    it("uses the router timeout for the action", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ id: "x", ok: true, data: {} }),
      );
      const spy = vi.spyOn(globalThis, "setTimeout");

      const client = new RpcClient("http://worker:8091");
      await client.invoke("guild.shell.get", { guildId: "101", actorId: "1" });

      expect(spy).toHaveBeenCalledWith(
        expect.any(Function),
        rpcRouter["guild.shell.get"].timeoutMs,
      );
      spy.mockRestore();
    });

    it("throws RpcError carrying the envelope code", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          id: "x",
          ok: false,
          error: "Guild not found in bot cache",
          code: "GUILD_NOT_FOUND",
        }),
      );

      const client = new RpcClient("http://worker:8091");
      let caught: unknown;
      try {
        await client.invoke("guild.shell.get", { guildId: "101", actorId: "1" });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(RpcError);
      expect((caught as InstanceType<typeof RpcError>).code).toBe("GUILD_NOT_FOUND");
      expect((caught as Error).message).toBe("Guild not found in bot cache");
      expect(isGuildMissing(caught)).toBe(true);
    });

    it("passes other codes through", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          id: "x",
          ok: false,
          error: "nope",
          code: "FORBIDDEN",
        }),
      );

      const client = new RpcClient("http://worker:8091");
      let caught: unknown;
      try {
        await client.invoke("guild.shell.get", { guildId: "101", actorId: "1" });
      } catch (err) {
        caught = err;
      }
      expect((caught as InstanceType<typeof RpcError>).code).toBe("FORBIDDEN");
      expect(isGuildMissing(caught)).toBe(false);
    });

    it("rejects ok:true without data", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: "x", ok: true }));

      const client = new RpcClient("http://worker:8091");
      await expect(
        client.invoke("guild.shell.get", { guildId: "101", actorId: "1" }),
      ).rejects.toThrow("response missing expected data");
    });

    it("rejects a failure envelope without a code as malformed", async () => {
      const malformed = { id: "x", ok: false, error: "nope" } as unknown as RpcResponse;
      fetchMock.mockResolvedValue(jsonResponse(malformed));

      const client = new RpcClient("http://worker:8091");
      await expect(
        client.invoke("guild.shell.get", { guildId: "101", actorId: "1" }),
      ).rejects.toThrow("malformed response");
    });
  });
});
