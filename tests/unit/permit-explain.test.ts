import { describe, expect, it, vi } from "vitest";
import { allExplanationCard } from "../../apps/bot/src/admin/src/permits/explain.js";
import { PermitRepository } from "../../packages/permits/src/repository.js";

function cardText(card: any): string {
  const container = JSON.parse(JSON.stringify(card.components[0]));
  return container.components
    .filter((component: any) => component.type === 10)
    .map((component: any) => component.content)
    .join("\n");
}

describe("allExplanationCard", () => {
  it("groups every node by verdict", () => {
    const results = new Map([
      [
        "mod.ban",
        {
          rows: [{ tier: "custom:user", verdict: "allow" as const }],
          allowed: true,
        },
      ],
      [
        "admin.config",
        {
          rows: [{ tier: "custom:user", verdict: "deny" as const }],
          allowed: false,
        },
      ],
      [
        "mod.kick",
        {
          rows: [{ tier: "owner", verdict: "pass" as const }],
          allowed: false,
        },
      ],
    ]);

    const card = allExplanationCard(results, {
      userId: "123",
      actionRows: [],
    });
    const text = cardText(card);

    expect(text).toContain(
      "✅ 1 allowed · ❌ 1 denied · ➡️ 1 no explicit permit",
    );
    expect(text).toContain("### ✅ Allowed\n`mod.ban`");
    expect(text).toContain("### ❌ Denied\n`admin.config`");
    expect(text).toContain("### ➡️ No explicit permit\n`mod.kick`");
  });
});

describe("PermitRepository.explainPermitNodes", () => {
  it("evaluates every node from a single permit chain", async () => {
    const findMany = vi.fn(async () => [
      {
        nodes: ["mod.ban", "mod.kick"],
        polarity: "Grant",
        position: 0,
        assignments: [
          { targetType: "USER", targetId: "target-user", expiresAt: null },
        ],
        conditions: null,
        expiresAt: null,
        schedule: null,
        timezone: null,
        builtin: false,
      },
    ]);
    const repository = new PermitRepository(
      { permit: { findMany } } as any,
      { get: vi.fn(async () => null) } as any,
    );

    const results = await repository.explainPermitNodes(
      { guildId: "guild", userId: "target-user" },
      ["mod.ban", "mod.kick", "admin.config"],
      undefined,
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(results.get("mod.ban")?.allowed).toBe(true);
    expect(results.get("mod.kick")?.allowed).toBe(true);
    expect(results.get("admin.config")?.allowed).toBe(false);
  });
});
