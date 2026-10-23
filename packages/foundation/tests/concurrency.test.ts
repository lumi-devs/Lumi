import { describe, expect, test } from "bun:test";
import { mapWithConcurrency } from "../src/index.ts";

describe("mapWithConcurrency", () => {
  test("preserves order and does not stop on undefined items", async () => {
    const values = [undefined, 1, 2, 3];
    const result = await mapWithConcurrency(values, 2, async (value) => value);
    expect(result).toEqual(values);
  });
});
