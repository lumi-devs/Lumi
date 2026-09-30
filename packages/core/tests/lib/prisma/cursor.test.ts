import { describe, expect, it } from "bun:test";
import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";
import {
  createdAtIdKeysetWhere,
  decodeCreatedAtIdCursor,
  decodeSingleKeyCursor,
  encodeCreatedAtIdCursor,
  encodeSingleKeyCursor,
  singleKeyKeysetWhere,
  splitPage,
} from "#lib/prisma/cursor.js";

describe("createdAt/id cursor", () => {
  it("round-trips through encode/decode", () => {
    const createdAt = new Date("2026-01-02T03:04:05.678Z");
    const cursor = encodeCreatedAtIdCursor({ createdAt, id: 42 });
    const decoded = decodeCreatedAtIdCursor(cursor);
    expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(decoded.id).toBe(42);
  });

  it("produces an opaque, non-JSON string", () => {
    const cursor = encodeCreatedAtIdCursor({ createdAt: new Date(), id: 1 });
    expect(() => JSON.parse(cursor)).toThrow();
  });

  it("builds a descending keyset where clause", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const where = createdAtIdKeysetWhere({ createdAt, id: 5 });
    expect(where).toEqual({
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 5 } }],
    });
  });

  for (const bad of [
    "",
    "not-base64url-json",
    Buffer.from("not json", "utf8").toString("base64url"),
    Buffer.from(JSON.stringify(["only-one-part"]), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify([1, 2]), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify(["not-a-date", 1]), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify(["2026-01-01T00:00:00.000Z", 1.5]), "utf8").toString(
      "base64url",
    ),
    "a".repeat(600),
  ]) {
    it(`rejects an invalid cursor: ${JSON.stringify(bad).slice(0, 40)}`, () => {
      expect(() => decodeCreatedAtIdCursor(bad)).toThrow(CodedRpcError);
      try {
        decodeCreatedAtIdCursor(bad);
        throw new Error("expected decode to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(CodedRpcError);
        expect((err as CodedRpcError).code).toBe(RpcFailureCodes.BadRequest);
      }
    });
  }
});

describe("single-key cursor", () => {
  it("round-trips through encode/decode", () => {
    expect(decodeSingleKeyCursor(encodeSingleKeyCursor(7))).toBe(7);
  });

  it("builds a descending keyset where clause", () => {
    expect(singleKeyKeysetWhere("caseNumber", 10)).toEqual({
      caseNumber: { lt: 10 },
    });
  });

  for (const bad of [
    "",
    "not-base64url-json",
    Buffer.from(JSON.stringify([1, 2]), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify(["1"]), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify([1.5]), "utf8").toString("base64url"),
  ]) {
    it(`rejects an invalid cursor: ${JSON.stringify(bad).slice(0, 40)}`, () => {
      expect(() => decodeSingleKeyCursor(bad)).toThrow(CodedRpcError);
    });
  }
});

describe("splitPage", () => {
  it("reports no more when rows fit exactly within take", () => {
    const { page, hasMore } = splitPage([1, 2, 3], 3);
    expect(page).toEqual([1, 2, 3]);
    expect(hasMore).toBe(false);
  });

  it("trims the lookahead row and reports more", () => {
    const { page, hasMore } = splitPage([1, 2, 3, 4], 3);
    expect(page).toEqual([1, 2, 3]);
    expect(hasMore).toBe(true);
  });
});
