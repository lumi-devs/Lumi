import { describe, it, expect } from "bun:test";
import {
  parseRpcResponse,
  type RpcActionName,
  type RpcResponsePayloads,
} from "./rpc.js";

describe("parseRpcResponse", () => {
  it("accepts ok:true with data", () => {
    expect(
      parseRpcResponse({ id: "1", ok: true, data: { a: 1 } }),
    ).toEqual({ id: "1", ok: true, data: { a: 1 } });
  });

  it("accepts ok:false with error", () => {
    expect(parseRpcResponse({ id: "1", ok: false, error: "nope" })).toEqual({
      id: "1",
      ok: false,
      error: "nope",
    });
  });

  it("rejects ok:false without error", () => {
    expect(() => parseRpcResponse({ id: "1", ok: false })).toThrow(
      /without error/,
    );
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

describe("RpcResponsePayloads", () => {
  it("only covers registered actions", () => {
    const onlyKnownActions: keyof RpcResponsePayloads extends RpcActionName
      ? true
      : false = true;
    expect(onlyKnownActions).toBe(true);
  });
});
