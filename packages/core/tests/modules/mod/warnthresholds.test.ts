import { describe, it, expect } from "vitest";
import { buildWarnThresholdsPanel } from "#modules/mod/lib/warn-thresholds-panel.js";

describe("WarnThresholds Panel", () => {
  it("renders card with select menu and button rows", () => {
    const thresholds = {
      "3": { action: "mute", duration: "1h" },
      "5": { action: "kick" },
      "10": { action: "ban" },
    };

    const card = buildWarnThresholdsPanel(thresholds, 30);
    expect(card.components).toBeDefined();
    expect(card.components.length).toBeGreaterThanOrEqual(1);

    const container = card.components[0].toJSON();
    const actionRows = container.components.filter(
      (c: { type: number }) => c.type === 1,
    );
    expect(actionRows).toHaveLength(3);
  });

  it("disables removal when the selected count has no saved rule", () => {
    const card = buildWarnThresholdsPanel({}, 30, { selectedCount: 4 });
    const container = card.components[0].toJSON();
    const buttonRow = container.components
      .filter((c: { type: number }) => c.type === 1)
      .at(-1);
    const removeButton = buttonRow.components.find(
      (b: { custom_id?: string }) => b.custom_id?.startsWith("wt:remove_rule"),
    );
    expect(removeButton.disabled).toBe(true);
  });
});
