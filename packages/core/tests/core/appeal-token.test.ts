import { describe, it, expect, beforeAll, vi } from "vitest";

const GUILD_ID = "123456789012345678";
const USER_ID = "444444444444444444";

describe("appeal token", () => {
  beforeAll(() => {
    process.env["APPEAL_TOKEN_SECRET"] = "test-appeal-secret";
  });

  it("round-trips a freshly generated token", async () => {
    const { generateAppealToken, verifyAppealToken } = await import(
      "#lib/appeals/token.js"
    );
    const token = generateAppealToken({ guildId: GUILD_ID, caseId: 7, userId: USER_ID });
    const payload = verifyAppealToken(token);

    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({ guildId: GUILD_ID, caseId: 7, userId: USER_ID });
  });

  it("rejects a token signed with a different secret", async () => {
    const { generateAppealToken, verifyAppealToken } = await import(
      "#lib/appeals/token.js"
    );
    const token = generateAppealToken({ guildId: GUILD_ID, caseId: 7, userId: USER_ID });

    process.env["APPEAL_TOKEN_SECRET"] = "a-different-secret";
    try {
      expect(verifyAppealToken(token)).toBeNull();
    } finally {
      process.env["APPEAL_TOKEN_SECRET"] = "test-appeal-secret";
    }
  });

  it("rejects a tampered payload even with a valid-looking signature", async () => {
    const { generateAppealToken, verifyAppealToken } = await import(
      "#lib/appeals/token.js"
    );
    const token = generateAppealToken({ guildId: GUILD_ID, caseId: 7, userId: USER_ID });
    const [payloadB64, sig] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ guildId: GUILD_ID, caseId: 999, userId: USER_ID, exp: Date.now() + 100_000 }),
    ).toString("base64url");

    expect(verifyAppealToken(`${tampered}.${sig}`)).toBeNull();
    expect(payloadB64).toBeTruthy();
  });

  it("rejects an expired token", async () => {
    const { generateAppealToken, verifyAppealToken } = await import(
      "#lib/appeals/token.js"
    );
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const token = generateAppealToken(
        { guildId: GUILD_ID, caseId: 7, userId: USER_ID },
        1000,
      );
      vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
      expect(verifyAppealToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["", "not-a-token", "onlyonepart", "a.b.c", "abc.def"])(
    "rejects malformed input %j",
    async (input) => {
      const { verifyAppealToken } = await import("#lib/appeals/token.js");
      expect(verifyAppealToken(input)).toBeNull();
    },
  );
});
