import { describe, it, expect } from "vitest";
import { ButtonStyle } from "discord.js";
import {
  tabRow,
  buildHubView,
  buildSettingsView,
  buildPermissionsView,
  buildAddonsView,
  type HubTab,
} from "#core/lib/hub-panel.js";

const TAB_IDS: Record<HubTab, string> = {
  overview: "lumi:home",
  modules: "lumi:tab:modules",
  permissions: "lumi:tab:permissions",
  settings: "lumi:tab:settings",
  addons: "lumi:tab:addons",
};

const buttonsOf = (rowJson: { components: unknown[] }) =>
  rowJson.components as {
    custom_id: string;
    style: number;
    label: string;
  }[];

describe("hub-panel navigation", () => {
  it("tabRow renders all five tabs in a stable order", () => {
    const buttons = buttonsOf(tabRow("overview").toJSON());
    expect(buttons.map((b) => b.custom_id)).toEqual([
      "lumi:home",
      "lumi:tab:modules",
      "lumi:tab:permissions",
      "lumi:tab:settings",
      "lumi:tab:addons",
    ]);
  });

  it.each(Object.keys(TAB_IDS) as HubTab[])(
    "highlights only the active tab (%s)",
    (active) => {
      const buttons = buttonsOf(tabRow(active).toJSON());
      for (const b of buttons) {
        const isActive = b.custom_id === TAB_IDS[active];
        expect(b.style).toBe(
          isActive ? ButtonStyle.Primary : ButtonStyle.Secondary,
        );
      }
    },
  );
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

  it("every top-level view carries the tab bar", () => {
    const views = {
      overview: buildHubView({
        moduleCount: 3,
        enabledCount: 2,
        prefix: null,
        locale: "en-US",
      }),
      settings: buildSettingsView({ prefix: "!", locale: "de" }),
      permissions: buildPermissionsView([]),
      addons: buildAddonsView(),
    };
    for (const view of Object.values(views)) {
      const json = serialize(view);
      expect(json).toContain("lumi:home");
      expect(json).toContain("lumi:tab:modules");
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
