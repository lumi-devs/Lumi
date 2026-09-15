import { describe, it, expect } from "bun:test";
import { parseRpcResponse } from "./envelope.js";

describe("parseRpcResponse", () => {
  it("accepts ok:true with data", () => {
    expect(
      parseRpcResponse({ id: "1", ok: true, data: { a: 1 } }),
    ).toEqual({ id: "1", ok: true, data: { a: 1 } });
  });

  it("accepts ok:false with an error and a code", () => {
    expect(
      parseRpcResponse({ id: "1", ok: false, error: "nope", code: "HANDLER_ERROR" }),
    ).toEqual({ id: "1", ok: false, error: "nope", code: "HANDLER_ERROR" });
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
});
