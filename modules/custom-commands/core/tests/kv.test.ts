import { describe, expect, it } from "vitest";
import { createKvAdapter } from "../kv.js";
import type { ModuleServices } from "@lumi/module-kit";

const services = {} as ModuleServices;

describe("custom command KV limits", () => {
  it("enforces the per-run KV operation budget before touching the database", async () => {
    const adapter = createKvAdapter(services, "guild", "user", 0);
    await expect(adapter.get("key")).rejects.toThrow(/KV operations exceeded/);
    await expect(adapter.set("key", "value")).rejects.toThrow(
      /KV operations exceeded/,
    );
    await expect(adapter.incr("key")).rejects.toThrow(/KV operations exceeded/);
    await expect(adapter.del("key")).rejects.toThrow(/KV operations exceeded/);
  });
});
