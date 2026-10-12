import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import { explainPermit } from "#src/lib/api/permissions/PermitResolver.js";
import type { TargetPermitPayload } from "#src/lib/prisma/repositories/PermissionRepository.js";

function bucket(grant: string[] = [], deny: string[] = []): TargetPermitPayload {
  return { custom: { grant, deny }, enforced: { grant: [], deny: [] } };
}

function enforcedBucket(grant: string[] = [], deny: string[] = []): TargetPermitPayload {
  return { custom: { grant: [], deny: [] }, enforced: { grant, deny } };
}

function empty(): TargetPermitPayload {
  return { custom: { grant: [], deny: [] }, enforced: { grant: [], deny: [] } };
}

describe("explainPermit", () => {
  let getPermitChain: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getPermitChain = vi.fn().mockResolvedValue({ tiers: [empty()], isQuarantined: false });
    (container as any).db = { permissions: { getPermitChain } };
    (container as any).client = undefined;
  });

  const actor = { guildId: "G1", userId: "U1", guildOwnerId: "OWNER_ID" };

  it("reports the owner tier as allow for the guild owner", async () => {
    const rows = await explainPermit("mod.ban", { ...actor, userId: "OWNER_ID" });
    expect(rows[0]).toMatchObject({ tier: "owner", verdict: "allow" });
    expect(getPermitChain).not.toHaveBeenCalled();
  });

  it("reports every tier without short-circuiting on an enforced deny", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [enforcedBucket([], ["mod.ban"]), bucket(["mod.ban"])],
      isQuarantined: false,
    });
    const rows = await explainPermit("mod.ban", { ...actor, roleIds: ["R1"] });
    expect(rows).toContainEqual(
      expect.objectContaining({ tier: "enforced:user", verdict: "deny" }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ tier: "custom:role:R1", verdict: "allow" }),
    );
  });

  it("names the matched rule in detail", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket(["mod.*"])],
      isQuarantined: false,
    });
    const rows = await explainPermit("mod.ban", { ...actor, roleIds: ["R1"] });
    expect(rows).toContainEqual(
      expect.objectContaining({ tier: "custom:role:R1", verdict: "allow", detail: "grant mod.*" }),
    );
  });

  it("marks custom tiers as ignored while quarantined", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket(["mod.ban"])],
      isQuarantined: true,
    });
    const rows = await explainPermit("mod.ban", { ...actor, roleIds: ["R1"] });
    const role = rows.find((r) => r.tier === "custom:role:R1");
    expect(role?.verdict).toBe("allow");
    expect(role?.detail).toContain("ignored while quarantined");
  });

  it("reports the manager tier as allow for administrators from the member cache", async () => {
    (container as any).client = {
      guilds: {
        cache: new Map([
          [
            "G1",
            {
              members: {
                cache: new Map([
                  ["U1", { permissions: { has: () => true } }],
                ]),
              },
            },
          ],
        ]),
      },
    };
    const rows = await explainPermit("mod.ban", actor);
    expect(rows).toContainEqual(
      expect.objectContaining({ tier: "manager", verdict: "allow" }),
    );
  });

  it("labels the channel tier when a channelId is given", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket([], ["mod.ban"])],
      isQuarantined: false,
    });
    const rows = await explainPermit("mod.ban", { ...actor, channelId: "C1" });
    expect(rows).toContainEqual(
      expect.objectContaining({ tier: "custom:channel", verdict: "deny" }),
    );
  });
});
