import { describe, it, expect } from "vitest";
import { buildWarnThresholdsPanelView } from "../../../src/modules/mod/lib/warn-thresholds-panel.js";

describe("WarnThresholds Panel View Test", () => {
  it("renders card view with select menu and button rows", () => {
    const thresholds = {
      "3": { action: "mute", duration: "1h" },
      "5": { action: "kick" },
      "10": { action: "ban" },
    };

    const view = buildWarnThresholdsPanelView(thresholds, 30);
    expect(view.id).toBe("warnthresholds");

    const renderCtx = {
      sessionId: "wt:g1:u1",
      guildId: "g1",
      userId: "u1",
      moduleStore: {} as any,
    };

    const card = view.render(renderCtx);
    expect(card.components).toBeDefined();
    expect(card.components.length).toBeGreaterThanOrEqual(1);
  });
});
