import { describe, it, expect, afterEach } from "bun:test";
import {
  GdprExportSigningKeyUnavailable,
  resolveGdprExportSigningKey,
  signGdprExportToken,
  verifyGdprExportToken,
} from "@lumi/lib/gdpr/export-token.js";

describe("gdpr export download token", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("resolveGdprExportSigningKey", () => {
    it("prefers GDPR_EXPORT_SIGNING_SECRET over RPC_INTERNAL_TOKEN", () => {
      process.env["GDPR_EXPORT_SIGNING_SECRET"] = "dedicated-secret";
      process.env["RPC_INTERNAL_TOKEN"] = "rpc-secret";
      expect(resolveGdprExportSigningKey()).toBe("dedicated-secret");
    });

    it("falls back to RPC_INTERNAL_TOKEN when unset", () => {
      delete process.env["GDPR_EXPORT_SIGNING_SECRET"];
      process.env["RPC_INTERNAL_TOKEN"] = "rpc-secret";
      expect(resolveGdprExportSigningKey()).toBe("rpc-secret");
    });

    it("throws when neither secret is configured", () => {
      delete process.env["GDPR_EXPORT_SIGNING_SECRET"];
      delete process.env["RPC_INTERNAL_TOKEN"];
      expect(() => resolveGdprExportSigningKey()).toThrow(
        GdprExportSigningKeyUnavailable,
      );
    });
  });

  describe("sign / verify round trip", () => {
    const key = "test-signing-key";

    it("verifies a freshly signed token", () => {
      const token = signGdprExportToken("job-123", 60_000, key);
      const result = verifyGdprExportToken(token, key);
      expect(result).toEqual({ valid: true, jobId: "job-123" });
    });

    it("rejects a token signed with a different key", () => {
      const token = signGdprExportToken("job-123", 60_000, key);
      const result = verifyGdprExportToken(token, "a-different-key");
      expect(result).toEqual({ valid: false, reason: "bad-signature" });
    });

    it("rejects an expired token", () => {
      const token = signGdprExportToken("job-123", -1, key);
      const result = verifyGdprExportToken(token, key);
      expect(result).toEqual({ valid: false, reason: "expired" });
    });

    it("rejects a malformed token", () => {
      expect(verifyGdprExportToken("not-a-real-token", key)).toEqual({
        valid: false,
        reason: "malformed",
      });
      expect(verifyGdprExportToken("a.b", key)).toEqual({
        valid: false,
        reason: "malformed",
      });
    });

    it("rejects a token tampered to target a different job id", () => {
      const token = signGdprExportToken("job-123", 60_000, key);
      const [, expiresAt, mac] = token.split(".");
      const tampered = ["job-999", expiresAt, mac].join(".");
      const result = verifyGdprExportToken(tampered, key);
      expect(result).toEqual({ valid: false, reason: "bad-signature" });
    });
  });
});
