import { describe, it, expect } from "bun:test";
import { checkRpc } from "#lib/doctor/checks/rpc.js";

describe("checkRpc", () => {
  it("skips when no RPC url is configured", async () => {
    const result = await checkRpc({ getUrl: () => null });
    expect(result.status).toBe("skip");
  });

  it("fails when the health request throws", async () => {
    const result = await checkRpc({
      getUrl: () => "http://api:8091",
      fetchHealth: () => Promise.reject(new Error("ECONNREFUSED")),
    });
    expect(result.status).toBe("fail");
  });

  it("fails on a non-ok health response", async () => {
    const result = await checkRpc({
      getUrl: () => "http://api:8091",
      fetchHealth: () => Promise.resolve(new Response("nope", { status: 500 })),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/500/);
  });

  it("reports reachable and notes contract version is not exposed", async () => {
    const result = await checkRpc({
      getUrl: () => "http://api:8091",
      fetchHealth: () => Promise.resolve(new Response("ok", { status: 200 })),
    });
    expect(result.status).toBe("ok");
    expect(result.detail).toMatch(/reachability only/);
  });
});
