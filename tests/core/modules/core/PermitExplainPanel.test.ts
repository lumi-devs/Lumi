import { mock } from "bun:test";
import { describe, it, expect, vi, beforeEach } from "bun:test";
import {
  buildPermitExplainPickerView,
  buildPermitExplainView,
  PermitExplainNodesPerPage,
} from "#src/admin/ui/Permissions.js";
import type { CardReply } from "#src/lib/ui/Cards.js";

type ComponentJson = {
  type: number;
  components?: ComponentJson[];
  custom_id?: string;
  options?: { label?: string; value?: string; default?: boolean }[];
  placeholder?: string;
  disabled?: boolean;
};

const toJson = (card: CardReply) =>
  card.components[0]!.toJSON() as { components: ComponentJson[] };

const flatCustomIds = (card: CardReply): string[] => {
  const out: string[] = [];
  const walk = (nodes: ComponentJson[] | undefined): void => {
    for (const n of nodes ?? []) {
      if (n.custom_id) out.push(n.custom_id);
      walk(n.components);
    }
  };
  walk(toJson(card).components);
  return out;
};

describe("permit explain picker", () => {
  it("shows only the user select before a member is picked", () => {
    const card = buildPermitExplainPickerView({ nodeNames: ["mod.ban"] });
    const ids = flatCustomIds(card);
    expect(ids).toContain("lumi:permexplainuser");
    expect(ids.some((id) => id.startsWith("lumi:permexplainnode:"))).toBe(false);
  });

  it("shows the node select once a member is picked", () => {
    const card = buildPermitExplainPickerView({
      userId: "123",
      nodeNames: ["mod.ban", "admin.*"],
    });
    const ids = flatCustomIds(card);
    expect(ids).toContain("lumi:permexplainnode:123");
  });

  it("sorts and dedupes node names", () => {
    const card = buildPermitExplainPickerView({
      userId: "123",
      nodeNames: ["mod.ban", "admin.*", "mod.ban"],
    });
    const labels: string[] = [];
    const walk = (nodes: ComponentJson[] | undefined): void => {
      for (const n of nodes ?? []) {
        for (const o of n.options ?? []) if (o.label) labels.push(o.label);
        walk(n.components);
      }
    };
    walk(toJson(card).components);
    expect(labels).toEqual(["admin.*", "mod.ban"]);
  });

  it("paginates node options at 25 per page", () => {
    const names = Array.from({ length: PermitExplainNodesPerPage + 5 }, (_, i) => `mod.node${i}`);
    const page0 = buildPermitExplainPickerView({ userId: "123", nodeNames: names });
    const ids0 = flatCustomIds(page0);
    expect(ids0.some((id) => id.startsWith("lumi:permexplainnodepage:123:"))).toBe(true);
    const page1 = buildPermitExplainPickerView({ userId: "123", nodeNames: names, nodePage: 1 });
    const labels: string[] = [];
    const walk = (nodes: ComponentJson[] | undefined): void => {
      for (const n of nodes ?? []) {
        for (const o of n.options ?? []) if (o.label) labels.push(o.label);
        walk(n.components);
      }
    };
    walk(toJson(page1).components);
    expect(labels).toHaveLength(5);
  });

  it("clamps an out-of-range page", () => {
    const card = buildPermitExplainPickerView({
      userId: "123",
      nodeNames: ["mod.ban"],
      nodePage: 99,
    });
    expect(flatCustomIds(card)).toContain("lumi:permexplainnode:123");
  });
});

describe("permit explain result", () => {
  it("carries a back button to the inspector", () => {
    const card = buildPermitExplainView("mod.ban", "@Rogue", [
      { tier: "custom:role:R1", verdict: "allow", detail: "grant mod.*" },
    ]);
    expect(flatCustomIds(card)).toContain("lumi:permexplain");
  });
});

const listPermits = mock(() =>
  Promise.resolve([{ name: "mod.ban" }, { name: "admin.*" }]),
);

mock.module("#src/lib/module-system/Utility.js", () => ({
  getUtility: () => ({ listPermits }),
}));

describe("renderPermitExplain", () => {
  beforeEach(() => {
    listPermits.mockClear();
  });

  it("renders the picker when nothing is picked yet", async () => {
    const { renderPermitExplain } = await import(
      "#src/modules/onboarding/services/HubPanel.js"
    );
    const editReply = vi.fn();
    await renderPermitExplain(
      {} as never,
      { guildId: "G1", editReply } as never,
      {},
    );
    expect(listPermits).toHaveBeenCalledTimes(1);
    const card = editReply.mock.calls[0]![0] as CardReply;
    expect(flatCustomIds(card)).toContain("lumi:permexplainuser");
  });

  it("renders the explanation when member and node are picked", async () => {
    const { renderPermitExplain } = await import(
      "#src/modules/onboarding/services/HubPanel.js"
    );
    const { container } = await import("#src/lib/Services.js");
    (container as any).db = {
      permissions: {
        getPermitChain: vi.fn().mockResolvedValue({
          tiers: [{ custom: { grant: ["mod.*"], deny: [] }, enforced: { grant: [], deny: [] } }],
          isQuarantined: false,
        }),
      },
    };
    (container as any).client = undefined;
    const editReply = vi.fn();
    await renderPermitExplain(
      {} as never,
      {
        guildId: "G1",
        guild: undefined,
        channelId: "C1",
        editReply,
      } as never,
      { userId: "U9", node: "mod.ban" },
    );
    const card = editReply.mock.calls[0]![0] as CardReply;
    const text = JSON.stringify(card.components[0]!.toJSON());
    expect(text).toContain("mod.ban");
    expect(text).toContain("U9");
  });

  it("falls back to the picker for an unknown node", async () => {
    const { renderPermitExplain } = await import(
      "#src/modules/onboarding/services/HubPanel.js"
    );
    const editReply = vi.fn();
    await renderPermitExplain(
      {} as never,
      { guildId: "G1", editReply } as never,
      { userId: "U9", node: "nope.*" },
    );
    const card = editReply.mock.calls[0]![0] as CardReply;
    expect(flatCustomIds(card)).toContain("lumi:permexplainnode:U9");
  });
});
