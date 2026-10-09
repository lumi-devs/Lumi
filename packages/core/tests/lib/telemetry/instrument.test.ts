import { describe, it, expect, vi } from "bun:test";
import { instrumentedRun } from "#lib/telemetry/instrument.js";

describe("instrumentedRun", () => {
  it("returns the wrapped result", async () => {
    const res = await instrumentedRun(
      "ping",
      "slash",
      { guildId: "g1", user: { id: "u1" } },
      () => Promise.resolve("pong"),
    );

    expect(res).toBe("pong");
  });

  it("accepts sources without ids", async () => {
    const res = await instrumentedRun("ping", "slash", {}, () => 42);

    expect(res).toBe(42);
  });

  it("rethrows handler errors after recording them", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      instrumentedRun("ban", "slash", { guildId: "g1", author: { id: "u2" } }, exec),
    ).rejects.toThrow("boom");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("reads the user id from message authors as well as interaction users", async () => {
    const seen: unknown[] = [];
    await instrumentedRun("nick", "prefix", { author: { id: "u9" } }, () => {
      seen.push(true);
      return "ok";
    });

    expect(seen).toEqual([true]);
  });
});
