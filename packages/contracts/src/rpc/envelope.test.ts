import { describe, it, expect } from "bun:test";
import {
  CodedRpcError,
  RpcFailureCodes,
  RpcRetryableByDefault,
  makeRpcFailure,
  parseRpcResponse,
} from "./envelope.js";

describe("parseRpcResponse", () => {
  it("accepts ok:true with data", () => {
    expect(
      parseRpcResponse({ id: "1", ok: true, data: { a: 1 } }),
    ).toEqual({ id: "1", ok: true, data: { a: 1 } });
  });

  it("accepts ok:false with an error and a code", () => {
    expect(
      parseRpcResponse({ id: "1", ok: false, error: "nope", code: "HANDLER_ERROR" }),
    ).toEqual({ id: "1", ok: false, error: "nope", code: "HANDLER_ERROR", retryable: false });
  });

  it("rejects ok:false without error", () => {
    expect(() =>
      parseRpcResponse({ id: "1", ok: false, code: "HANDLER_ERROR" }),
    ).toThrow(/without error/);
  });

  it("rejects ok:false without a code", () => {
    expect(() => parseRpcResponse({ id: "1", ok: false, error: "nope" })).toThrow(
      /without error and code/,
    );
  });

  it("rejects a code outside the failure vocabulary", () => {
    expect(() =>
      parseRpcResponse({ id: "1", ok: false, error: "nope", code: "SOMETHING" }),
    ).toThrow(/Malformed/);
  });

  it("rejects ok:true with error", () => {
    expect(() =>
      parseRpcResponse({ id: "1", ok: true, error: "nope" }),
    ).toThrow(/with error/);
  });

  it("rejects a malformed envelope", () => {
    expect(() => parseRpcResponse({ ok: true })).toThrow(/Malformed/);
  });

  it("defaults retryable from the code table when the field is absent (an older worker/dashboard build)", () => {
    expect(
      parseRpcResponse({ id: "1", ok: false, error: "nope", code: "CONFLICT" }),
    ).toEqual({ id: "1", ok: false, error: "nope", code: "CONFLICT", retryable: true });
    expect(
      parseRpcResponse({ id: "1", ok: false, error: "nope", code: "FORBIDDEN" }),
    ).toEqual({ id: "1", ok: false, error: "nope", code: "FORBIDDEN", retryable: false });
  });

  it("keeps an explicit retryable/retryAfterMs on the wire", () => {
    expect(
      parseRpcResponse({
        id: "1",
        ok: false,
        error: "slow down",
        code: "HANDLER_ERROR",
        retryable: true,
        retryAfterMs: 1500,
      }),
    ).toEqual({
      id: "1",
      ok: false,
      error: "slow down",
      code: "HANDLER_ERROR",
      retryable: true,
      retryAfterMs: 1500,
    });
  });
});

describe("RpcRetryableByDefault", () => {
  it("covers every failure code exactly once", () => {
    expect(Object.keys(RpcRetryableByDefault).sort()).toEqual(
      Object.values(RpcFailureCodes).sort(),
    );
  });

  it("marks the documented transient codes retryable and the rest not", () => {
    expect(RpcRetryableByDefault[RpcFailureCodes.Conflict]).toBe(true);
    for (const code of [
      RpcFailureCodes.Unauthorized,
      RpcFailureCodes.BadRequest,
      RpcFailureCodes.UnknownAction,
      RpcFailureCodes.DashboardDisabled,
      RpcFailureCodes.Forbidden,
      RpcFailureCodes.GuildNotFound,
      RpcFailureCodes.ModuleNotLoaded,
      RpcFailureCodes.HandlerError,
      RpcFailureCodes.Internal,
      RpcFailureCodes.ContractMismatch,
    ]) {
      expect(RpcRetryableByDefault[code]).toBe(false);
    }
  });
});

describe("makeRpcFailure", () => {
  it("derives retryable from the table by default", () => {
    expect(makeRpcFailure("1", "nope", RpcFailureCodes.Conflict)).toEqual({
      id: "1",
      ok: false,
      error: "nope",
      code: RpcFailureCodes.Conflict,
      retryable: true,
      retryAfterMs: undefined,
    });
  });

  it("lets the caller override retryable and set retryAfterMs", () => {
    expect(
      makeRpcFailure("1", "nope", RpcFailureCodes.Forbidden, {
        retryable: true,
        retryAfterMs: 5000,
      }),
    ).toEqual({
      id: "1",
      ok: false,
      error: "nope",
      code: RpcFailureCodes.Forbidden,
      retryable: true,
      retryAfterMs: 5000,
    });
  });
});

describe("CodedRpcError", () => {
  it("defaults retryable from the table", () => {
    const err = new CodedRpcError(RpcFailureCodes.Conflict, "busy");
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBeUndefined();
  });

  it("lets the thrower override retryable and attach retryAfterMs", () => {
    const err = new CodedRpcError(RpcFailureCodes.HandlerError, "rate limited", {
      retryable: true,
      retryAfterMs: 3000,
    });
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(3000);
  });
});
