import { describe, it, expect, afterEach } from "bun:test";
import { getClientIp, UnknownClientIp } from "#/lib/client-ip";

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

  it("ignores cf-connecting-ip/x-real-ip unless CLIENT_IP_HEADER names them", () => {
    // These headers are attacker-settable like any other unless the operator
    // opts in via CLIENT_IP_HEADER, so trusting them unconditionally would
    // let a client hand itself a fresh rate-limit bucket per request.
    expect(
      getClientIp(
        h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7", "x-real-ip": "9.9.9.9" }),
      ),
    ).toBe("203.0.113.7");
    expect(
      getClientIp(
        h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7", "cf-connecting-ip": "9.9.9.9" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("trusts x-real-ip only once declared via CLIENT_IP_HEADER", () => {
    process.env["CLIENT_IP_HEADER"] = "x-real-ip";
    expect(
      getClientIp(
        h({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.7" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("uses only the operator-declared header when CLIENT_IP_HEADER is set", () => {
    process.env["CLIENT_IP_HEADER"] = "true-client-ip";
    expect(
      getClientIp(
        h({ "x-forwarded-for": "1.1.1.1", "true-client-ip": "203.0.113.9" }),
      ),
    ).toBe("203.0.113.9");
    expect(getClientIp(h({ "x-forwarded-for": "1.1.1.1" }))).toBe(
      UnknownClientIp,
    );
  });

  it("counts back further when more proxies are trusted", () => {
    process.env["TRUSTED_PROXY_HOPS"] = "2";
    expect(
      getClientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.5" })),
    ).toBe("203.0.113.7");
  });

  it("strips ports so one client can't split its budget across them", () => {
    expect(getClientIp(h({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe(
      "203.0.113.7",
    );
    expect(getClientIp(h({ "x-forwarded-for": "[2001:db8::1]:443" }))).toBe(
      "2001:db8::1",
    );
  });

  it("falls back to a single shared bucket rather than a per-request one", () => {
    expect(getClientIp(h({}))).toBe(UnknownClientIp);
    expect(getClientIp(h({ "x-forwarded-for": "not-an-ip" }))).toBe(
      UnknownClientIp,
    );
  });
});
