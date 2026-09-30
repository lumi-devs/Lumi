import { afterEach, describe, expect, it } from "bun:test";
import { CONTRACT_VERSION } from "../version.js";
import { RpcClient, RpcError, isContractMismatch, isGuildMissing } from "./client.js";
import { RpcFailureCodes } from "./envelope.js";

let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
  void server?.stop(true);
  server = undefined;
});

function serve(handler: (req: Request) => Response | Promise<Response>) {
  server = Bun.serve({ port: 0, fetch: handler });
  return `http://localhost:${server.port}`;
}

describe("RpcClient", () => {
  it("decodes a successful response", async () => {
    const baseUrl = serve(() =>
      Response.json({ id: "1", ok: true, data: { entries: [] } }),
    );
    const client = new RpcClient({ baseUrl });
    const result = await client.invoke("guild.afk.list", { guildId: "g1" });
    expect(result).toEqual({ entries: [] });
  });

  it("throws RpcError with the server's code on a coded failure", async () => {
    const baseUrl = serve(() =>
      Response.json({ id: "1", ok: false, error: "not allowed", code: RpcFailureCodes.Forbidden }),
    );
    const client = new RpcClient({ baseUrl });
    const err = await client.invoke("guild.afk.list", { guildId: "g1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).code).toBe(RpcFailureCodes.Forbidden);
    expect((err as RpcError).action).toBe("guild.afk.list");
    expect((err as RpcError).retryable).toBe(false);
  });

  it("carries the server's retryable/retryAfterMs onto RpcError", async () => {
    const baseUrl = serve(() =>
      Response.json({
        id: "1",
        ok: false,
        error: "already in progress",
        code: RpcFailureCodes.Conflict,
        retryable: true,
        retryAfterMs: 2500,
      }),
    );
    const client = new RpcClient({ baseUrl });
    const err = await client.invoke("guild.afk.list", { guildId: "g1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).retryable).toBe(true);
    expect((err as RpcError).retryAfterMs).toBe(2500);
  });

  it("defaults retryable from the code table when an older server omits the field", async () => {
    const baseUrl = serve(() =>
      Response.json({ id: "1", ok: false, error: "already in progress", code: RpcFailureCodes.Conflict }),
    );
    const client = new RpcClient({ baseUrl });
    const err = await client.invoke("guild.afk.list", { guildId: "g1" }).catch((e: unknown) => e);
    expect((err as RpcError).retryable).toBe(true);
  });

  it("maps GUILD_NOT_FOUND and CONTRACT_MISMATCH via the helper predicates", async () => {
    const baseUrl = serve(() =>
      Response.json({ id: "1", ok: false, error: "no guild", code: RpcFailureCodes.GuildNotFound }),
    );
    const client = new RpcClient({ baseUrl });
    const err = await client.invoke("guild.afk.list", { guildId: "g1" }).catch((e: unknown) => e);
    expect(isGuildMissing(err)).toBe(true);
    expect(isContractMismatch(err)).toBe(false);
  });

  it("throws TIMEOUT when the server never responds within the action's timeout", async () => {
    const baseUrl = serve(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      return Response.json({ id: "1", ok: true, data: {} });
    });
    const client = new RpcClient({
      baseUrl,
      injectTraceHeaders: () => ({}),
    });
    const invokePromise = client.invoke("guild.afk.list", { guildId: "g1" });
    const err = await invokePromise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).code).toBe("TIMEOUT");
    expect((err as RpcError).retryable).toBe(true);
  }, 10_000);

  it("throws WORKER_DOWN when the connection is refused", async () => {
    const client = new RpcClient({ baseUrl: "http://localhost:1" });
    const err = await client.invoke("guild.afk.list", { guildId: "g1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).code).toBe("WORKER_DOWN");
    expect((err as RpcError).retryable).toBe(true);
  });

  it("throws MALFORMED when the response body is not valid JSON", async () => {
    const baseUrl = serve(() => new Response("not json", { status: 200 }));
    const client = new RpcClient({ baseUrl });
    const err = await client.invoke("guild.afk.list", { guildId: "g1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).code).toBe("MALFORMED");
    expect((err as RpcError).retryable).toBe(false);
  });

  it("throws MALFORMED when the response envelope doesn't parse", async () => {
    const baseUrl = serve(() => Response.json({ nonsense: true }));
    const client = new RpcClient({ baseUrl });
    const err = await client.invoke("guild.afk.list", { guildId: "g1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).code).toBe("MALFORMED");
  });

  it("sends the contract version header and the bearer token", async () => {
    let seenHeaders: Headers | undefined;
    const baseUrl = serve((req) => {
      seenHeaders = req.headers;
      return Response.json({ id: "1", ok: true, data: { entries: [] } });
    });
    const client = new RpcClient({ baseUrl, token: "secret-token" });
    await client.invoke("guild.afk.list", { guildId: "g1" });
    expect(seenHeaders?.get("x-lumi-contract-version")).toBe(CONTRACT_VERSION);
    expect(seenHeaders?.get("authorization")).toBe("Bearer secret-token");
  });

  it("omits the authorization header when no token is configured", async () => {
    let seenHeaders: Headers | undefined;
    const baseUrl = serve((req) => {
      seenHeaders = req.headers;
      return Response.json({ id: "1", ok: true, data: { entries: [] } });
    });
    const client = new RpcClient({ baseUrl });
    await client.invoke("guild.afk.list", { guildId: "g1" });
    expect(seenHeaders?.has("authorization")).toBe(false);
  });

  it("calls the trace hook and stamps its headers onto the request body", async () => {
    let calls = 0;
    let body: { traceparent?: string; tracestate?: string } | undefined;
    const baseUrl = serve(async (req) => {
      body = (await req.json()) as typeof body;
      return Response.json({ id: "1", ok: true, data: { entries: [] } });
    });
    const client = new RpcClient({
      baseUrl,
      injectTraceHeaders: () => {
        calls += 1;
        return { traceparent: "00-trace-01", tracestate: "vendor=1" };
      },
    });
    await client.invoke("guild.afk.list", { guildId: "g1" });
    expect(calls).toBe(1);
    expect(body?.traceparent).toBe("00-trace-01");
    expect(body?.tracestate).toBe("vendor=1");
  });

  it("healthy() reports the server's /healthz status", async () => {
    const baseUrl = serve((req) => new Response(null, { status: new URL(req.url).pathname === "/healthz" ? 200 : 404 }));
    const client = new RpcClient({ baseUrl });
    expect(await client.healthy()).toBe(true);
  });

  it("healthy() is false when the server is unreachable", async () => {
    const client = new RpcClient({ baseUrl: "http://localhost:1" });
    expect(await client.healthy()).toBe(false);
  });
});
