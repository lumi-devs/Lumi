import {
  buildAddonReposView,
  buildAddonsView,
} from "#modules/core/ui/addons.js";
import { buildHubView, buildSettingsView } from "#modules/core/ui/hub.js";
import {
  buildPermissionsView,
  PERMS_PER_PAGE,
} from "#modules/core/ui/permissions.js";
import { describe, it, expect } from "vitest";

type ComponentJson = {
  type: number;
  components?: ComponentJson[];
  accessory?: { custom_id?: string; style?: number };
  custom_id?: string;
  style?: number;
  disabled?: boolean;
};

const toJson = (card: { components: { toJSON(): unknown }[] }) =>
  card.components[0]!.toJSON() as { components: ComponentJson[] };

const actionRows = (card: { components: { toJSON(): unknown }[] }) =>
  toJson(card).components.filter((c) => c.type === 1);

const sections = (card: { components: { toJSON(): unknown }[] }) =>
  toJson(card).components.filter((c) => c.type === 9);

describe("hub-panel view builders", () => {
  it("buildHubView renders the tab bar with home active", () => {
    const card = buildHubView({
      moduleCount: 5,
      enabledCount: 4,
      prefix: "!",
      locale: "en-US",
    });

    const [tabs] = actionRows(card);
    expect(tabs).toBeDefined();
    expect(tabs!.components).toHaveLength(5);
    const home = tabs!.components!.find((b) => b.custom_id === "lumi:tab:home");
    expect(home?.disabled).toBe(true);
    expect(home?.style).toBe(1);
  });

  it("buildSettingsView renders the prefix as a section row with edit accessory", () => {
    const card = buildSettingsView({ prefix: "!", locale: "en-US" });
    const [prefixRow] = sections(card);
    expect(prefixRow).toBeDefined();
    expect(prefixRow!.accessory?.custom_id).toBe("lumi:prefix:set");
  });

  it("buildPermissionsView renders revoke accessories and paginates", () => {
    const overrides = Array.from({ length: PERMS_PER_PAGE + 1 }, (_, i) => ({
      permitId: i,
      permitName: `Permit ${i}`,
      kind: (i % 2 === 0 ? "enforced" : "custom"),
      builtin: i % 2 === 0,
      targetType: (i % 2 === 0 ? "user" : "role"),
      targetId: `${100000000000000000n + BigInt(i)}`,
    }));

    const card = buildPermissionsView(overrides, 0);
    expect(sections(card)).toHaveLength(PERMS_PER_PAGE);
    expect(sections(card)[0]!.accessory?.custom_id).toContain("lumi:permdel:");

    const pageRow = actionRows(card).find((r) =>
      r.components?.some((b) => b.custom_id?.startsWith("lumi:permpage")),
    );
    expect(pageRow).toBeDefined();
  });

  it("buildAddonsView renders the addons tab active", () => {
    const card = buildAddonsView({
      installedCount: 0,
      repoCount: 0,
      pendingUpdates: [],
    });
    const tabs = actionRows(card).at(-1);
    const addons = tabs?.components?.find(
      (b) => b.custom_id === "lumi:tab:addons",
    );
    expect(addons?.disabled).toBe(true);
  });

  it("buildAddonReposView renders repos as update rows", () => {
    const card = buildAddonReposView([
      {
        name: "community",
        url: "https://x",
        branch: "main",
        installedCount: 2,
      },
    ]);
    expect(sections(card)[0]!.accessory?.custom_id).toBe(
      "lumi:addon:update_repo:community",
    );
  });
});
