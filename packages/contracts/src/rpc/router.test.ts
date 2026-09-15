import { describe, expect, it } from "bun:test";
import { rpcRouter, rpcSlices, type RpcInput, type RpcOutput } from "./router.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// Shapeshift's `Unwrap` yields a mapped type that is structurally equal to the
// plain object but not type-identical, so inputs are compared by mutual
// assignability, with `any` ruled out so the check can't pass vacuously.
type SameShape<A, B> = 0 extends 1 & A
  ? false
  : [A] extends [B]
    ? [B] extends [A]
      ? true
      : false
    : false;

describe("rpcRouter", () => {
  it("keeps every slice's actions, so no two slices claim the same action", () => {
    const declared = rpcSlices.reduce(
      (sum, slice) => sum + Object.keys(slice).length,
      0,
    );
    expect(Object.keys(rpcRouter)).toHaveLength(declared);
  });

  it("gives every action a positive timeout and a summary", () => {
    for (const [name, entry] of Object.entries(rpcRouter)) {
      expect(entry.timeoutMs, name).toBeGreaterThan(0);
      expect(entry.summary.length, name).toBeGreaterThan(0);
    }
  });

  it("derives exact input and output types from the entries", () => {
    const input: SameShape<RpcInput<"guild.cases.revoke">, { caseNumber: number }> =
      true;
    const optionalInput: SameShape<
      RpcInput<"guild.overrides.list">,
      { moduleName?: string | undefined }
    > = true;
    const none: Equal<RpcInput<"guild.panic.get">, undefined> = true;
    const output: Equal<
      RpcOutput<"guild.cases.revoke">,
      { success: true; caseNumber: number }
    > = true;
    expect([input, optionalInput, none, output]).toEqual([true, true, true, true]);
  });
});
