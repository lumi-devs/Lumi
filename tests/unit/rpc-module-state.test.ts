import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createModuleStateHandler } from "../../src/core/rpcRoutes.ts";

function request(body: unknown, method = "POST", remoteAddress = "127.0.0.1") {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as never as {
    method: string;
    headers: Record<string, string>;
    url: string;
    socket: { remoteAddress: string };
  };
  req.method = method;
  req.headers = {};
  req.url = "/api/v1/guilds/123/modules/demo/state";
  req.socket = { remoteAddress };
  return req;
}

function response() {
  const res = {
    statusCode: 0,
    body: "",
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(body: string) {
      this.body = body;
    },
  };
  return res;
}

describe("createModuleStateHandler", () => {
  it("resyncs guild commands after applying a module state change", async () => {
    const setEnabled = vi.fn(async () => {});
    const syncCommands = vi.fn(async () => {});
    const handler = createModuleStateHandler({
      moduleLoader: {
        listGlobal: () => [{ name: "demo" }] as never,
        setEnabled,
      },
      syncCommands,
      token: undefined,
    });

    const res = response();
    await handler(request({ enabled: false }) as never, res as never);

    expect(setEnabled).toHaveBeenCalledWith("demo", "123", false);
    expect(syncCommands).toHaveBeenCalledWith("123");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ module: "demo", enabled: false });
  });

  it("rejects unauthenticated requests from non-loopback addresses", async () => {
    const setEnabled = vi.fn(async () => {});
    const handler = createModuleStateHandler({
      moduleLoader: {
        listGlobal: () => [{ name: "demo" }] as never,
        setEnabled,
      },
      token: undefined,
    });

    const res = response();
    await handler(
      request({ enabled: false }, "POST", "203.0.113.5") as never,
      res as never,
    );

    expect(res.statusCode).toBe(401);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("requires a matching bearer token when a secret is configured", async () => {
    const setEnabled = vi.fn(async () => {});
    const handler = createModuleStateHandler({
      moduleLoader: {
        listGlobal: () => [{ name: "demo" }] as never,
        setEnabled,
      },
      token: "secret",
    });

    const unauthorized = response();
    await handler(request({ enabled: false }) as never, unauthorized as never);
    expect(unauthorized.statusCode).toBe(401);
    expect(setEnabled).not.toHaveBeenCalled();

    const authorized = response();
    const req = request({ enabled: false });
    req.headers.authorization = "Bearer secret";
    await handler(req as never, authorized as never);
    expect(authorized.statusCode).toBe(200);
    expect(setEnabled).toHaveBeenCalledWith("demo", "123", false);
  });
});
