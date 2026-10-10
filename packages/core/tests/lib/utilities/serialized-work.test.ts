import { describe, it, expect } from "bun:test";
import { withSerializedWork } from "../../../src/lib/utilities/serialized-work.js";

describe("withSerializedWork", () => {
  it("serializes async work behind a key", async () => {
    const order: number[] = [];

    const task1 = withSerializedWork("key-1", async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
      return "res-1";
    });

    const task2 = withSerializedWork("key-1", () => {
      order.push(2);
      return Promise.resolve("res-2");
    });

    const [r1, r2] = await Promise.all([task1, task2]);

    expect(r1).toBe("res-1");
    expect(r2).toBe("res-2");
    expect(order).toEqual([1, 2]);
  });
});
