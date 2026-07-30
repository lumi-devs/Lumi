import { describe, it, expect } from "vitest";
import {
  buildHubView,
  buildSettingsView,
  buildPermissionsView,
  buildAddonsView,
} from "#modules/core/lib/hub-panel.js";

describe("hub-panel view builders", () => {
  it("buildHubView creates a valid control panel card", () => {
    const card = buildHubView({
      moduleCount: 5,
      enabledCount: 4,
      prefix: "!",
      locale: "en-US",
    });
    expect(card.components).toBeDefined();
    expect(card.components.length).toBeGreaterThan(0);
  });

  it("buildSettingsView renders settings menu components", () => {
    const card = buildSettingsView({ prefix: "!", locale: "en-US" });
    expect(card.components).toBeDefined();
    expect(card.components.length).toBeGreaterThan(0);
  });

  it("buildPermissionsView renders permissions components", () => {
    const card = buildPermissionsView([], []);
    expect(card.components).toBeDefined();
    expect(card.components.length).toBeGreaterThan(0);
  });

  it("buildAddonsView renders addons menu view", () => {
    const card = buildAddonsView({ installedCount: 0, repoCount: 0 });
    expect(card.components).toBeDefined();
    expect(card.components.length).toBeGreaterThan(0);
  });
});
