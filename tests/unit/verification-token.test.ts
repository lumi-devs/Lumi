import { describe, expect, it } from "vitest";
import {
  buildVerificationUrl,
  generateVerificationToken,
  hashVerificationToken,
  isVerificationTokenUsable,
  normalizeWebBaseUrl,
  resolveWebBaseUrl,
  VerificationTokenBytes,
  VerificationTokenLength,
  VerificationTokenPattern,
} from "../../modules/security/verification/token.ts";

describe("verification tokens", () => {
  it("generates URL-safe tokens with 32 random bytes", () => {
    const tokens = new Set(
      Array.from({ length: 32 }, () => generateVerificationToken()),
    );

    expect(tokens.size).toBe(32);
    for (const token of tokens) {
      expect(token).toMatch(VerificationTokenPattern);
      expect(token).toHaveLength(VerificationTokenLength);
      expect(token).not.toContain("=");
      expect(Buffer.from(token, "base64url")).toHaveLength(
        VerificationTokenBytes,
      );
    }
  });

  it("hashes tokens with stable sha256 hex", () => {
    const token = "fixed-verification-token";

    expect(hashVerificationToken(token)).toBe(hashVerificationToken(token));
    expect(hashVerificationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashVerificationToken(token)).not.toBe(
      hashVerificationToken(`${token}-other`),
    );
    expect(hashVerificationToken("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("accepts unexpired, unused tokens", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(
      isVerificationTokenUsable(
        { expiresAt: new Date(now.getTime() + 1_000), usedAt: null },
        now,
      ),
    ).toBe(true);
    expect(
      isVerificationTokenUsable(
        { expiresAt: now.getTime() + 1_000 },
        now.getTime(),
      ),
    ).toBe(true);
  });

  it("rejects expired, used, and invalid tokens", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(
      isVerificationTokenUsable(
        { expiresAt: new Date(now.getTime() - 1_000), usedAt: null },
        now,
      ),
    ).toBe(false);
    expect(
      isVerificationTokenUsable(
        { expiresAt: now.getTime(), usedAt: null },
        now,
      ),
    ).toBe(false);
    expect(
      isVerificationTokenUsable(
        { expiresAt: new Date(now.getTime() + 60_000), usedAt: now },
        now,
      ),
    ).toBe(false);
    expect(
      isVerificationTokenUsable({ expiresAt: "not-a-date", usedAt: null }, now),
    ).toBe(false);
  });
});

describe("web verification URLs", () => {
  it("normalizes http and https base URLs", () => {
    expect(normalizeWebBaseUrl(" https://lumi.example/ ")).toBe(
      "https://lumi.example",
    );
    expect(normalizeWebBaseUrl("http://localhost:3000///")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeWebBaseUrl("ftp://lumi.example")).toBeNull();
    expect(normalizeWebBaseUrl("lumi.example")).toBeNull();
    expect(normalizeWebBaseUrl("")).toBeNull();
  });

  it("falls back to WEB_BASE_URL when the config value is empty", () => {
    expect(resolveWebBaseUrl(null, "https://env.example/")).toBe(
      "https://env.example",
    );
    expect(
      resolveWebBaseUrl("https://configured.example/", "https://env.example"),
    ).toBe("https://configured.example");
    expect(resolveWebBaseUrl("not-a-url", "https://env.example")).toBe(
      "https://env.example",
    );
  });

  it("builds the dashboard verify route", () => {
    expect(buildVerificationUrl("https://lumi.example/", "abc_DEF-123")).toBe(
      "https://lumi.example/verify/abc_DEF-123",
    );
  });
});
