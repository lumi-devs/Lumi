import { describe, expect, it } from "bun:test";
import { assertPublicUrl, ipBlocked } from "./host-methods.js";

describe("ipBlocked", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "0.0.0.0",
    "100.64.0.1",
    "192.0.2.1",
    "198.51.100.7",
    "203.0.113.5",
    "224.0.0.1",
  ])("blocks %s", (ip) => {
    expect(ipBlocked(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.167.1.1", "9.9.9.9"])(
    "allows %s",
    (ip) => {
      expect(ipBlocked(ip)).toBe(false);
    },
  );

  it.each([
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd00::1",
    "ff02::1",
    "2002:0a00:0001::",
    "2001:0000:4136:e378:8000:63bf:3fff:fdd2",
    "64:ff9b::0a00:0001",
    "::ffff:10.0.0.1",
    "not-an-ip",
  ])("blocks v6 %s", (ip) => {
    expect(ipBlocked(ip)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888"])("allows v6 %s", (ip) => {
    expect(ipBlocked(ip)).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-http schemes, credentials, and literal private IPs without DNS", async () => {
    await expect(assertPublicUrl("ftp://example.com/x")).rejects.toThrow();
    await expect(assertPublicUrl("https://user:pass@example.com/")).rejects.toThrow();
    await expect(assertPublicUrl("http://10.0.0.1/")).rejects.toThrow();
    await expect(assertPublicUrl("not a url")).rejects.toThrow();
  });

  it("accepts a literal public IP", async () => {
    expect((await assertPublicUrl("https://8.8.8.8/")).hostname).toBe("8.8.8.8");
  });
});
