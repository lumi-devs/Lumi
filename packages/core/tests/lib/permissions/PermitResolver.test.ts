import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import type { TargetPermitPayload } from "#lib/prisma/repositories/PermissionRepository.js";

function bucket(grant: string[] = [], deny: string[] = []): TargetPermitPayload {
  return { custom: { grant, deny }, enforced: { grant: [], deny: [] } };
}

function enforcedBucket(grant: string[] = [], deny: string[] = []): TargetPermitPayload {
  return { custom: { grant: [], deny: [] }, enforced: { grant, deny } };
}

function empty(): TargetPermitPayload {
  return { custom: { grant: [], deny: [] }, enforced: { grant: [], deny: [] } };
}

describe("PermitResolver.hasPermit - precedence chain", () => {
  let resolver: PermitResolver;
  let getPermitChain: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getPermitChain = vi.fn();
    (container as any).db = { permissions: { getPermitChain } };
    (container as any).client = undefined;
    resolver = new PermitResolver();
  });

  const baseOpts = {
    guildId: "G1",
    userId: "U1",
    guildOwnerId: "OWNER_ID",
  };

  it("bot owner (via application owner) bypasses the chain entirely", async () => {
    (container as any).client = { application: { owner: { id: "U1" } } };
    const result = await resolver.hasPermit({ ...baseOpts, permitNode: "mod.ban" });
    expect(result).toBe(true);
    expect(getPermitChain).not.toHaveBeenCalled();
  });

  it("guild owner bypasses the chain entirely", async () => {
    const result = await resolver.hasPermit({
      ...baseOpts,
      userId: "OWNER_ID",
      permitNode: "mod.ban",
    });
    expect(result).toBe(true);
    expect(getPermitChain).not.toHaveBeenCalled();
  });

  it("grants when an enforced permit at the user tier matches", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [enforcedBucket(["admin.*"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({ ...baseOpts, permitNode: "admin.config" });
    expect(result).toBe(true);
  });

  it("enforced deny at the user tier wins even with a matching custom grant elsewhere", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [enforcedBucket([], ["mod.ban"]), bucket(["mod.ban"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R1"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(false);
  });

  it("falls through to a custom grant on a role when nothing else matches", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket(["mod.ban"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R1"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(true);
  });

  it("a custom deny at the channel tier beats a custom grant at a role tier (channel is more specific)", async () => {
    // Chain order: user, channel, role
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket([], ["mod.ban"]), bucket(["mod.ban"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      channelId: "C1",
      roleIds: ["R1"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(false);
  });

  it("a custom deny at the user's own tier beats a custom grant on a role", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [bucket([], ["mod.ban"]), bucket(["mod.ban"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R1"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(false);
  });

  it("respects role order: a deny on the higher-position role (first in roleIds) beats a grant on a lower one", async () => {
    // Caller is responsible for position-ordering roleIds highest-first;
    // the resolver must respect whatever order it's given without re-sorting.
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket([], ["mod.ban"]), bucket(["mod.ban"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R_HIGH", "R_LOW"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(false);
  });

  it("if the higher-position role grants and a lower one denies, the higher role's grant wins", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket(["mod.ban"]), bucket([], ["mod.ban"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R_HIGH", "R_LOW"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(true);
  });

  it("quarantine strips custom permits (grant and deny) at every tier but leaves enforced permits intact", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [enforcedBucket(["admin.*"]), bucket(["mod.ban"])],
      isQuarantined: true,
    });
    const granted = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R1"],
      permitNode: "admin.config",
    });
    expect(granted).toBe(true); // enforced still applies

    const denied = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R1"],
      permitNode: "mod.ban",
    });
    expect(denied).toBe(false); // custom grant stripped by quarantine
  });

  it("defaults to deny when nothing in the chain matches", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [empty(), empty()],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R1"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(false);
  });

  it("wildcard node matching still works through the tiered walk", async () => {
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket(["mod.*"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R1"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(true);
  });

  it("regression: an @everyone-targeted custom permit (role ID === guild ID) still applies - memberRoleIds must not strip it", async () => {
    // The @everyone role's ID always equals the guild ID, and it's a real,
    // independently-assignable custom-permit target (grant "to everyone in
    // this guild"). A prior version of this precedence chain silently
    // excluded any role ID matching guildId, breaking this configuration.
    getPermitChain.mockResolvedValue({
      tiers: [empty(), bucket(["fun.*"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["G1"], // @everyone's role ID, equal to guildId
      permitNode: "fun.play",
    });
    expect(result).toBe(true);
  });

  it("regression: pre-existing multi-role union behavior is preserved when only grants exist anywhere", async () => {
    // Old flat-union semantics: any matching grant anywhere wins. With no
    // deny permits in play, the tiered walk must produce the same result.
    getPermitChain.mockResolvedValue({
      tiers: [empty(), empty(), bucket(["mod.ban"])],
      isQuarantined: false,
    });
    const result = await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R_HIGH", "R_LOW"],
      permitNode: "mod.ban",
    });
    expect(result).toBe(true);
  });

  it("builds the chain as [user, channel?, ...roles] in that order", async () => {
    getPermitChain.mockResolvedValue({ tiers: [empty()], isQuarantined: false });
    await resolver.hasPermit({
      ...baseOpts,
      channelId: "C1",
      roleIds: ["R1", "R2"],
      permitNode: "mod.ban",
    });
    expect(getPermitChain).toHaveBeenCalledWith("G1", "U1", [
      { targetType: "user", targetId: "U1" },
      { targetType: "channel", targetId: "C1" },
      { targetType: "role", targetId: "R1" },
      { targetType: "role", targetId: "R2" },
    ]);
  });

  it("omits the channel tier entirely when no channelId is given", async () => {
    getPermitChain.mockResolvedValue({ tiers: [empty()], isQuarantined: false });
    await resolver.hasPermit({
      ...baseOpts,
      roleIds: ["R1"],
      permitNode: "mod.ban",
    });
    expect(getPermitChain).toHaveBeenCalledWith("G1", "U1", [
      { targetType: "user", targetId: "U1" },
      { targetType: "role", targetId: "R1" },
    ]);
  });
});
