import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createModuleStateHandler } from "../../src/core/rpcRoutes.ts";

function request(body: unknown, method = "POST") {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as never as {
    method: string;
    headers: Record<string, string>;
    url: string;
  };
  req.method = method;
  req.headers = {};
  req.url = "/api/v1/guilds/123/modules/demo/state";
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
});
