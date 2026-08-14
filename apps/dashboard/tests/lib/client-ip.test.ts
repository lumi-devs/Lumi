import { describe, it, expect, afterEach } from "vitest";
import { getClientIp, UNKNOWN_CLIENT_IP } from "#/lib/client-ip";

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

afterEach(() => {
  delete process.env["CLIENT_IP_HEADER"];
  delete process.env["TRUSTED_PROXY_HOPS"];
});

describe("getClientIp", () => {
  it("takes the proxy-appended (last) X-Forwarded-For entry, not the client-supplied one", () => {
    expect(getClientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("gives a spoofing client the same bucket no matter what it prepends", () => {
    const a = getClientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }));
    const b = getClientIp(h({ "x-forwarded-for": "8.8.8.8, 203.0.113.7" }));
    const c = getClientIp(h({ "x-forwarded-for": "junk, 203.0.113.7" }));
    expect(new Set([a, b, c]).size).toBe(1);
  });

  it("prefers a proxy-set client-IP header over X-Forwarded-For", () => {
    expect(
      getClientIp(
        h({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.7" }),
      ),
    ).toBe("203.0.113.7");
    expect(
      getClientIp(
        h({ "x-forwarded-for": "1.1.1.1", "cf-connecting-ip": "203.0.113.8" }),
      ),
    ).toBe("203.0.113.8");
  });

  it("uses only the operator-declared header when CLIENT_IP_HEADER is set", () => {
    process.env["CLIENT_IP_HEADER"] = "true-client-ip";
    expect(
      getClientIp(
        h({ "x-forwarded-for": "1.1.1.1", "true-client-ip": "203.0.113.9" }),
      ),
    ).toBe("203.0.113.9");
    expect(getClientIp(h({ "x-forwarded-for": "1.1.1.1" }))).toBe(
      UNKNOWN_CLIENT_IP,
    );
  });

  it("counts back further when more proxies are trusted", () => {
    process.env["TRUSTED_PROXY_HOPS"] = "2";
    expect(
      getClientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.5" })),
    ).toBe("203.0.113.7");
  });

  it("strips ports so one client can't split its budget across them", () => {
    expect(getClientIp(h({ "x-real-ip": "203.0.113.7:51234" }))).toBe("203.0.113.7");
    expect(getClientIp(h({ "x-real-ip": "[2001:db8::1]:443" }))).toBe("2001:db8::1");
  });

  it("falls back to a single shared bucket rather than a per-request one", () => {
    expect(getClientIp(h({}))).toBe(UNKNOWN_CLIENT_IP);
    expect(getClientIp(h({ "x-forwarded-for": "not-an-ip" }))).toBe(
      UNKNOWN_CLIENT_IP,
    );
  });
});
