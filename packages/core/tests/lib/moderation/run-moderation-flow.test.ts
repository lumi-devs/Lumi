import { describe, it, expect, vi } from "vitest";
import { Result } from "@sapphire/framework";
import { runModerationFlow } from "#lib/moderation/ModerationCommand.js";

function fakeContext() {
  return {
    defer: vi.fn().mockResolvedValue(undefined),
    fetchT: vi.fn().mockResolvedValue((key: string) => key),
    guild: undefined,
    member: undefined,
    user: { id: "mod-1" },
    replySuccess: vi.fn().mockResolvedValue(undefined),
    replyError: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("runModerationFlow", () => {
  it("reports every rejection when all targets fail preHandle, not just the first", async () => {
    const ctx = fakeContext();

    await runModerationFlow(ctx, {
      resolveTarget: () => ["u-1", "u-2"],
      resolveReason: () => "test reason",
      preHandle: (_ctx: unknown, _t: unknown, target: string) =>
        Result.err({ title: "Rejected", body: `cannot act on ${target}` }),
      action: vi.fn(),
    } as any);

    expect(ctx.replySuccess).not.toHaveBeenCalled();
    expect(ctx.replyError).toHaveBeenCalledTimes(1);
    const [, body] = ctx.replyError.mock.calls[0]!;
    expect(body).toContain("u-1");
    expect(body).toContain("u-2");
  });

  it("keeps the specific reply when only one target is rejected", async () => {
    const ctx = fakeContext();

    await runModerationFlow(ctx, {
      resolveTarget: () => ["u-1"],
      resolveReason: () => "test reason",
      preHandle: () =>
        Result.err({ title: "Specific Title", body: "specific body" }),
      action: vi.fn(),
    } as any);

    expect(ctx.replyError).toHaveBeenCalledWith("Specific Title", "specific body");
  });
});
