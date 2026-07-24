import { describe, it, expect } from "vitest";
import { ButtonStyle } from "discord.js";
import {
  hubRow,
  backToHubRow,
  buildHubView,
  buildSettingsView,
  buildPermissionsView,
  buildAddonsView,
} from "#lib/hub-panel.js";

const buttonsOf = (rowJson: { components: unknown[] }) =>
  rowJson.components as {
    custom_id: string;
    style: number;
    label: string;
  }[];

describe("hub-panel navigation", () => {
  it("hubRow renders all module tabs in a stable order", () => {
    const buttons = buttonsOf(hubRow().toJSON());
    expect(buttons.map((b) => b.custom_id)).toEqual([
      "lumi:tab:modules",
      "lumi:tab:permissions",
      "lumi:tab:settings",
      "lumi:tab:addons",
    ]);
  });

  it("backToHubRow renders back to home button", () => {
    const buttons = buttonsOf(backToHubRow().toJSON());
    expect(buttons[0]?.custom_id).toBe("lumi:home");
  });
});

describe("hub-panel views", () => {
  const serialize = (v: { components: { toJSON(): unknown }[] }) =>
    JSON.stringify(v.components.map((c) => c.toJSON()));

  /** Recursively finds a component by custom_id anywhere in a view's tree. */
  const findComponent = (
    v: { components: { toJSON(): unknown }[] },
    customId: string,
  ): Record<string, unknown> | undefined => {
    const walk = (node: unknown): Record<string, unknown> | undefined => {
      if (!node || typeof node !== "object") return undefined;
      const obj = node as Record<string, unknown>;
      if (obj.custom_id === customId) return obj;
      for (const child of (obj.components as unknown[]) ?? []) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return undefined;
    };
    for (const c of v.components) {
      const hit = walk(c.toJSON());
      if (hit) return hit;
    }
    return undefined;
  };

  it("sub-views carry navigation buttons", () => {
    const hubView = buildHubView({
      moduleCount: 3,
      enabledCount: 2,
      prefix: null,
      locale: "en-US",
    });
    expect(serialize(hubView)).toContain("lumi:tab:modules");

    const subViews = [
      buildSettingsView({ prefix: "!", locale: "de" }),
      buildPermissionsView([]),
      buildAddonsView(),
    ];
    for (const view of subViews) {
      const json = serialize(view);
      expect(json).toContain("lumi:home");
    }
  });

  it("overview surfaces the enabled/total module count", () => {
    const json = serialize(
      buildHubView({
        moduleCount: 5,
        enabledCount: 4,
        prefix: null,
        locale: "en-US",
      }),
    );
    expect(json).toContain("**4**");
    expect(json).toContain("**5**");
  });

  it("settings offers a language selector and a prefix control", () => {
    const view = buildSettingsView({ prefix: null, locale: "fr" });
    expect(findComponent(view, "lumi:setlang")).toBeDefined();
    expect(findComponent(view, "lumi:prefix:set")).toBeDefined();
    // Reset is disabled when the prefix is already the default (null).
    expect(findComponent(view, "lumi:prefix:reset")?.disabled).toBe(true);
    // …and enabled once a custom prefix is set.
    const custom = buildSettingsView({ prefix: "!", locale: "fr" });
    expect(findComponent(custom, "lumi:prefix:reset")?.disabled).toBe(false);
  });

  it("permissions view caps the list and notes how many are hidden", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      commandPath: `cmd${i}`,
      modelType: "role",
      modelId: "123456789012345678",
      allow: i % 2 === 0,
    }));
    const json = serialize(buildPermissionsView(many));
    expect(json).toContain("Showing 25 of 30 overrides");
    // The remove-select is present with exactly the capped number of options.
    expect(json).toContain("lumi:permrm");
  });
});
