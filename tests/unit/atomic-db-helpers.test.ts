import { describe, expect, it, vi } from "vitest";
import type { DbContext } from "../../packages/db/src/context.js";
import { createLevelingHelpers } from "../../packages/db/src/helpers/leveling.js";
import { createRoleHelpers } from "../../packages/db/src/helpers/roles.js";
import { createTicketsHelpers } from "../../packages/db/src/helpers/tickets.js";

function context(prisma: object): DbContext {
  return {
    prisma: prisma as DbContext["prisma"],
    cache: {} as DbContext["cache"],
  };
}

describe("conditional database updates", () => {
  it("claims a ticket only while it is unclaimed", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const helpers = createTicketsHelpers(context({ ticket: { updateMany } }));
    const at = new Date("2026-01-01T00:00:00Z");

    const result = await helpers.claimTicketIfUnclaimed(
      "ticket-1",
      "user-1",
      at,
    );

    expect(result.count).toBe(0);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "ticket-1", claimedBy: null },
      data: { claimedBy: "user-1", claimedAt: at },
    });
  });

  it("releases a ticket only for its current claimant", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const helpers = createTicketsHelpers(context({ ticket: { updateMany } }));

    await helpers.releaseTicketIfClaimedBy("ticket-1", "user-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "ticket-1", claimedBy: "user-1" },
      data: { claimedBy: null, claimedAt: null },
    });
  });

  it("advances leveling only when the stored level is lower", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const helpers = createLevelingHelpers(
      context({ levelingUser: { updateMany } }),
    );

    const advanced = await helpers.advanceLevel("guild-1", "user-1", 5);

    expect(advanced).toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: { guildId: "guild-1", userId: "user-1", level: { lt: 5 } },
      data: { level: 5 },
    });
  });

  it("claims a bulk role job only when pending or its lease expired", async () => {
    const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
    const helpers = createRoleHelpers(context({ bulkRoleJob: { updateMany } }));

    const claimed = await helpers.bulkRole.claim("job-1", 300_000);

    expect(claimed.count).toBe(1);
    const call = updateMany.mock.calls[0]?.[0] as {
      where: {
        OR: Array<{ status: string; updatedAt?: { lt: Date } }>;
      };
      data: { status: string };
    };
    expect(call.data).toEqual({ status: "running" });
    expect(call.where.OR[0]).toEqual({ status: "pending" });
    expect(call.where.OR[1].status).toBe("running");
    expect(call.where.OR[1].updatedAt?.lt).toBeInstanceOf(Date);
  });

  it("does not overwrite a cancelled bulk role job with progress", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const helpers = createRoleHelpers(context({ bulkRoleJob: { updateMany } }));

    await helpers.bulkRole.increment("job-1", 10, 0);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        status: { notIn: ["completed", "cancelled", "failed"] },
      },
      data: { processed: { increment: 10 } },
    });
  });
});
