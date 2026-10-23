import { describe, expect, it } from "bun:test";
import { ActionRowBuilder, type ContainerBuilder } from "@discordjs/builders";
import type { ModuleStatus } from "@lumi/contracts";
import {
  buildModuleDetailView,
  buildPermitOrderView,
} from "../src/lumi/views.ts";

function actionRowCount(card: { components: readonly ContainerBuilder[] }): number {
  const container = card.components[0];
  if (!container) return 0;
  return container.components.filter((component) => component instanceof ActionRowBuilder).length;
}

const status: ModuleStatus = {
  name: "mod",
  displayName: "Moderation",
  emoji: "🔨",
  description: "Moderation tools.",
  version: "0.1.0",
  origin: "bundled",
  state: "loaded",
  commandCount: 13,
};

describe("Lumi hub views", () => {
  it("keeps module detail within Discord's five action-row limit", () => {
    const card = buildModuleDetailView({
      status,
      guildEnabled: true,
      globalEnabled: true,
      page: 0,
      config: {
        log_channel_id: "123",
        dm_on_punish: true,
        quarantine_role_id: "456",
      },
      fields: [
        { key: "log_channel_id", label: "Mod Log Channel", type: "channel" },
        { key: "dm_on_punish", label: "DM on Punish", type: "boolean" },
        { key: "quarantine_role_id", label: "Quarantine Role", type: "role" },
      ],
    });

    expect(actionRowCount(card)).toBeLessThanOrEqual(5);
  });

  it("keeps the permit order view within five action rows", () => {
    const permits = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      guildId: "g",
      name: `Permit ${index + 1}`,
      kind: "custom" as const,
      polarity: "grant" as const,
      nodes: ["mod.ban"],
      position: index,
      builtin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignments: [],
    }));

    const card = buildPermitOrderView(permits, 0);
    expect(actionRowCount(card)).toBeLessThanOrEqual(5);
  });
});
