import { describe, expect, it } from "bun:test";
import type { LumiServices } from "../src/services.ts";
import { evaluatePermit, matchPermitNode } from "../src/permits.ts";

describe("matchPermitNode", () => {
  it("matches wildcard * to anything", () => {
    expect(matchPermitNode("*", "mod.ban")).toBe(true);
    expect(matchPermitNode("*", "utility.purge")).toBe(true);
    expect(matchPermitNode("*", "anything")).toBe(true);
  });

  it("matches namespace wildcards", () => {
    expect(matchPermitNode("mod.*", "mod.ban")).toBe(true);
    expect(matchPermitNode("mod.*", "mod.lockdown.all")).toBe(true);
    expect(matchPermitNode("mod.*", "utility.purge")).toBe(false);
  });

  it("matches exact nodes", () => {
    expect(matchPermitNode("mod.ban", "mod.ban")).toBe(true);
    expect(matchPermitNode("mod.ban", "mod.kick")).toBe(false);
    expect(matchPermitNode("mod.ban", "mod.ban.sub")).toBe(false);
  });

  it("never matches empty nodes", () => {
    expect(matchPermitNode("", "mod.ban")).toBe(false);
    expect(matchPermitNode("mod.ban", "")).toBe(false);
    expect(matchPermitNode("", "")).toBe(false);
  });
});

type Payload = { custom: { grant: string[]; deny: string[] }; enforced: { grant: string[]; deny: string[] } };

function makeServices(options: {
  payloads?: Payload[];
  quarantined?: boolean;
  ownerIds?: string[];
  applicationOwner?: string | { members: Map<string, unknown> };
}): LumiServices {
  const emptyPayload = (): Payload => ({
    custom: { grant: [], deny: [] },
    enforced: { grant: [], deny: [] },
  });
  const payloads = options.payloads ?? [];

  return {
    runtime: {
      defaultPrefix: ",",
      ownerIds: new Set(options.ownerIds ?? []),
    },
    client: {
      application: options.applicationOwner
        ? { owner: options.applicationOwner }
        : null,
    },
    redis: {
      get: async () => (options.quarantined ? "1" : null),
    },
    keys: {
      quarantine: (guildId: string, userId: string) => `quarantine:${guildId}:${userId}`,
    },
    db: {
      permits: {
        getPermitChain: async () =>
          payloads.length > 0 ? payloads : [emptyPayload()],
      },
    },
  } as unknown as LumiServices;
}

const node = "mod.ban";

describe("evaluatePermit", () => {
  it("allows bot owners without querying the permit chain", async () => {
    let queried = false;
    const services = makeServices({ ownerIds: ["1"] });
    (services.db.permits as unknown as { getPermitChain: () => Promise<never[]> }).getPermitChain = async () => {
      queried = true;
      return [];
    };

    const result = await evaluatePermit(services, {
      guildId: "g",
      userId: "1",
      guildOwnerId: "2",
      node,
    });

    expect(result.allowed).toBe(true);
    expect(result.verdicts).toEqual([
      { tier: "owner", verdict: "allow", reason: "Bot owner override" },
    ]);
    expect(queried).toBe(false);
  });

  it("recognises application team owners", async () => {
    const services = makeServices({
      applicationOwner: { members: new Map([["9", {}]]) },
    });

    const result = await evaluatePermit(services, {
      guildId: "g",
      userId: "9",
      guildOwnerId: "2",
      node,
    });

    expect(result.allowed).toBe(true);
    expect(result.verdicts[0]).toEqual({
      tier: "owner",
      verdict: "allow",
      reason: "Bot owner override",
    });
  });

  it("still reports owner and manager passes for auditability", async () => {
    const services = makeServices({});
    const member = {
      permissions: { has: () => false },
      roles: { cache: [] },
    };

    const result = await evaluatePermit(services, {
      guildId: "g",
      userId: "3",
      guildOwnerId: "2",
      member: member as never,
      node,
    });

    expect(result.allowed).toBe(false);
    expect(result.verdicts.slice(0, 2)).toEqual([
      { tier: "owner", verdict: "pass" },
      { tier: "manager", verdict: "pass" },
    ]);
  });

  it("reports the enforced tier even when it does not decide", async () => {
    const services = makeServices({});

    const result = await evaluatePermit(services, {
      guildId: "g",
      userId: "3",
      guildOwnerId: "2",
      node,
    });

    expect(result.verdicts[2]).toEqual({
      tier: "enforced:user",
      verdict: "pass",
    });
  });

  it("lets a custom user grant decide", async () => {
    const services = makeServices({
      payloads: [
        {
          custom: { grant: ["mod.*"], deny: [] },
          enforced: { grant: [], deny: [] },
        },
      ],
    });

    const result = await evaluatePermit(services, {
      guildId: "g",
      userId: "3",
      guildOwnerId: "2",
      node,
    });

    expect(result.allowed).toBe(true);
    expect(result.verdicts.at(-1)).toEqual({
      tier: "custom:user",
      verdict: "allow",
      reason: "Matched custom rule: mod.*",
    });
  });

  it("lets an enforced deny override a custom grant", async () => {
    const services = makeServices({
      payloads: [
        {
          custom: { grant: ["mod.*"], deny: [] },
          enforced: { grant: [], deny: ["mod.ban"] },
        },
      ],
    });

    const result = await evaluatePermit(services, {
      guildId: "g",
      userId: "3",
      guildOwnerId: "2",
      node,
    });

    expect(result.allowed).toBe(false);
    expect(result.verdicts[2]).toEqual({
      tier: "enforced:user",
      verdict: "deny",
      reason: "Matched enforced rule: mod.ban",
    });
    // Later tiers are still evaluated so the explain panel is complete.
    expect(result.verdicts.at(-1)?.verdict).toBe("allow");
  });

  it("ignores custom rules while quarantined but honours enforced rules", async () => {
    const customOnly = await evaluatePermit(
      makeServices({
        quarantined: true,
        payloads: [
          {
            custom: { grant: ["mod.*"], deny: [] },
            enforced: { grant: [], deny: [] },
          },
        ],
      }),
      { guildId: "g", userId: "3", guildOwnerId: "2", node },
    );

    expect(customOnly.allowed).toBe(false);
    expect(customOnly.verdicts.at(-1)?.reason).toContain("ignored while quarantined");

    const enforcedAllow = await evaluatePermit(
      makeServices({
        quarantined: true,
        payloads: [
          {
            custom: { grant: [], deny: ["mod.ban"] },
            enforced: { grant: ["mod.ban"], deny: [] },
          },
        ],
      }),
      { guildId: "g", userId: "3", guildOwnerId: "2", node },
    );

    expect(enforcedAllow.allowed).toBe(true);
  });
});
