import { describe, it, expect, vi, beforeEach } from "bun:test";
import fc from "fast-check";
import { container } from "#lib/services.js";
import { evaluateNodeMatch, PermitResolver } from "#lib/permissions/PermitResolver.js";
import type { TargetPermitPayload } from "#lib/prisma/repositories/PermissionRepository.js";

const segment = fc.string({
  minLength: 1,
  maxLength: 6,
  unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
});

const node = fc
  .array(segment, { minLength: 1, maxLength: 4 })
  .map((segs) => segs.join("."));

describe("evaluateNodeMatch (property)", () => {
  it("is reflexive: a node always matches itself exactly", () => {
    fc.assert(
      fc.property(node, (n) => {
        expect(evaluateNodeMatch(n, n)).toBe(true);
      }),
    );
  });

  it("'*' matches every non-empty required node", () => {
    fc.assert(
      fc.property(node, (n) => {
        expect(evaluateNodeMatch("*", n)).toBe(true);
      }),
    );
  });

  it("'x.*' matches the namespace itself and every 'x.<suffix>'", () => {
    fc.assert(
      fc.property(node, node, (x, suffix) => {
        const wildcard = `${x}.*`;
        expect(evaluateNodeMatch(wildcard, x)).toBe(true);
        expect(evaluateNodeMatch(wildcard, `${x}.${suffix}`)).toBe(true);
      }),
    );
  });

  it("'x.*' never matches a sibling whose prefix merely starts with x (e.g. 'xy.z')", () => {
    fc.assert(
      fc.property(node, segment, segment, (x, extra, tail) => {
        const wildcard = `${x}.*`;
        const sibling = `${x}${extra}.${tail}`;
        expect(evaluateNodeMatch(wildcard, sibling)).toBe(false);
      }),
    );
  });

  it("empty granted or required node never matches anything", () => {
    fc.assert(
      fc.property(node, (n) => {
        expect(evaluateNodeMatch("", n)).toBe(false);
        expect(evaluateNodeMatch(n, "")).toBe(false);
      }),
    );
  });

  it("two distinct nodes with no wildcard relationship never match", () => {
    fc.assert(
      fc.property(node, node, (a, b) => {
        fc.pre(a !== b);
        fc.pre(!a.endsWith(".*") && !b.endsWith(".*"));
        expect(evaluateNodeMatch(a, b)).toBe(false);
      }),
    );
  });
});

const PERMIT_NODE = "mod.ban";
const WILDCARD_NODE = "mod.*";
const OTHER_NODE = "fun.play";
const OTHER_WILDCARD = "fun.*";

function emptyBucket() {
  return { grant: [] as string[], deny: [] as string[] };
}

function tierWith(custom: { grant: string[]; deny: string[] }): TargetPermitPayload {
  return { custom, enforced: emptyBucket() };
}

const unrelatedNode = fc.constantFrom(OTHER_NODE, OTHER_WILDCARD);

const arbitraryUnrelatedBucket = fc.record({
  grant: fc.array(unrelatedNode, { maxLength: 3 }),
  deny: fc.array(unrelatedNode, { maxLength: 3 }),
});

const arbitraryAnyBucket = fc.record({
  grant: fc.array(fc.constantFrom(PERMIT_NODE, WILDCARD_NODE, OTHER_NODE, OTHER_WILDCARD), {
    maxLength: 3,
  }),
  deny: fc.array(fc.constantFrom(PERMIT_NODE, WILDCARD_NODE, OTHER_NODE, OTHER_WILDCARD), {
    maxLength: 3,
  }),
});

describe("PermitResolver.hasPermit precedence (property)", () => {
  let resolver: PermitResolver;
  let getPermitChain: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getPermitChain = vi.fn();
    (container as any).db = { permissions: { getPermitChain } };
    (container as any).client = undefined;
    resolver = new PermitResolver();
  });

  const baseOpts = { guildId: "G1", userId: "U1", guildOwnerId: null };

  it("an enforced deny on the user tier always wins, regardless of any enforced grant or custom data anywhere", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryAnyBucket,
        fc.array(arbitraryAnyBucket, { maxLength: 3 }),
        fc.boolean(),
        async (userCustom, otherCustomTiers, isQuarantined) => {
          const tiers: TargetPermitPayload[] = [
            {
              enforced: { deny: [PERMIT_NODE], grant: [PERMIT_NODE, WILDCARD_NODE] },
              custom: userCustom,
            },
            ...otherCustomTiers.map(tierWith),
          ];
          getPermitChain.mockResolvedValue({ tiers, isQuarantined });
          const result = await resolver.hasPermit({ ...baseOpts, permitNode: PERMIT_NODE });
          expect(result).toBe(false);
        },
      ),
    );
  });

  it("an enforced grant on the user tier wins whenever there is no enforced deny, regardless of custom data or quarantine", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryUnrelatedBucket,
        fc.array(arbitraryAnyBucket, { maxLength: 3 }),
        fc.boolean(),
        async (userCustom, otherCustomTiers, isQuarantined) => {
          const tiers: TargetPermitPayload[] = [
            { enforced: { deny: [], grant: [PERMIT_NODE] }, custom: userCustom },
            ...otherCustomTiers.map(tierWith),
          ];
          getPermitChain.mockResolvedValue({ tiers, isQuarantined });
          const result = await resolver.hasPermit({ ...baseOpts, permitNode: PERMIT_NODE });
          expect(result).toBe(true);
        },
      ),
    );
  });

  it("quarantine fully ignores custom permits at every tier when the enforced tier has no match", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbitraryAnyBucket, { minLength: 1, maxLength: 4 }),
        async (customTiers) => {
          const tiers: TargetPermitPayload[] = customTiers.map(tierWith);
          getPermitChain.mockResolvedValue({ tiers, isQuarantined: true });
          const result = await resolver.hasPermit({ ...baseOpts, permitNode: PERMIT_NODE });
          expect(result).toBe(false);
        },
      ),
    );
  });

  it("the first tier with any custom match decides the result; deny beats grant within that tier, and later tiers never override it", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.constantFrom<"grant" | "deny">("grant", "deny"),
        fc.constantFrom(PERMIT_NODE, WILDCARD_NODE),
        fc.array(arbitraryAnyBucket, { minLength: 4, maxLength: 4 }),
        async (decidingIndex, polarity, matchNode, afterTiersRaw) => {
          const tiers: TargetPermitPayload[] = [];
          for (let i = 0; i < 4; i++) {
            if (i < decidingIndex) {
              tiers.push(tierWith(emptyBucket()));
            } else if (i === decidingIndex) {
              const bucket = emptyBucket();
              bucket[polarity] = [matchNode];
              tiers.push(tierWith(bucket));
            } else {
              tiers.push(tierWith(afterTiersRaw[i]!));
            }
          }
          getPermitChain.mockResolvedValue({ tiers, isQuarantined: false });
          const result = await resolver.hasPermit({ ...baseOpts, permitNode: PERMIT_NODE });
          expect(result).toBe(polarity === "grant");
        },
      ),
    );
  });
});
