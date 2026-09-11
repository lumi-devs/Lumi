import { describe, it, expect } from "bun:test";
import type {
  APIButtonComponentWithCustomId,
  APIThumbnailComponent,
} from "discord.js";
import {
  settingRow,
  thumbRow,
  tabRow,
  confirmRow,
  backRow,
  navRow,
  pageFooter,
  HubTabs,
  SectionLineLimit,
  ButtonLabelLimit,
} from "#lib/utilities/ui/kit.js";

describe("panel kit", () => {
  it("settingRow renders text lines with a button accessory", () => {
    const json = settingRow(["**Prefix**", "-# Current: `,`"], {
      customId: "cfg:edit:prefix",
      label: "Edit",
    }).toJSON();

    expect(json.components).toHaveLength(2);
    const accessory = json.accessory as APIButtonComponentWithCustomId;
    expect(accessory.custom_id).toBe("cfg:edit:prefix");
    expect(accessory.style).toBe(2);
  });

  it("settingRow caps text lines at three", () => {
    const json = settingRow(["a", "b", "c", "d"], {
      customId: "x",
      label: "y",
    }).toJSON();
    expect(json.components).toHaveLength(3);
  });

  it("thumbRow attaches a thumbnail accessory", () => {
    const json = thumbRow("line", "https://cdn.example/img.png").toJSON();
    const accessory = json.accessory as APIThumbnailComponent;
    expect(accessory.media.url).toBe("https://cdn.example/img.png");
  });

  it("tabRow marks the active tab primary and disabled", () => {
    const json = tabRow(
      "lumi:tab",
      [
        { id: "modules", label: "Modules" },
        { id: "settings", label: "Settings" },
      ],
      "settings",
    ).toJSON();

    const [modules, settings] = json.components as APIButtonComponentWithCustomId[];
    expect(modules).toBeDefined();
    expect(settings).toBeDefined();
    expect(modules!.custom_id).toBe("lumi:tab:modules");
    expect(modules!.style).toBe(2);
    expect(modules!.disabled).toBeFalsy();
    expect(settings!.style).toBe(1);
    expect(settings!.disabled).toBe(true);
  });

  it("confirmRow pairs danger confirm with secondary cancel", () => {
    const json = confirmRow({
      confirmId: "sec:panic:go",
      cancelId: "sec:panic:no",
    }).toJSON();

    expect(json.components[0]!.style).toBe(4);
    expect(json.components[1]!.style).toBe(2);
  });

  it("backRow renders a single secondary button", () => {
    const json = backRow("cfg:back").toJSON();
    expect(json.components).toHaveLength(1);
    expect((json.components[0] as APIButtonComponentWithCustomId).custom_id).toBe("cfg:back");
  });

  it("navRow pairs a back button with one primary action", () => {
    const json = navRow({
      backId: "cfg:back",
      action: { customId: "cfg:save", label: "Save" },
    }).toJSON();

    expect(json.components).toHaveLength(2);
    const [back, action] = json.components as APIButtonComponentWithCustomId[];
    expect(back!.custom_id).toBe("cfg:back");
    expect(back!.style).toBe(2);
    expect(action!.custom_id).toBe("cfg:save");
    expect(action!.style).toBe(1);
  });

  it("pageFooter renders a muted page line", () => {
    const json = pageFooter(0, 3, 12).toJSON();
    expect(json.content).toBe("-# Page 1 of 3 · 12 items");
  });

  it("pageFooter passes a string hint through", () => {
    const json = pageFooter(1, 2, "pick a tab below").toJSON();
    expect(json.content).toBe("-# Page 2 of 2 · pick a tab below");
  });

  it("HubTabs covers the hub/detail/addon flows", () => {
    expect(HubTabs.map((t) => t.id)).toEqual([
      "home",
      "modules",
      "permissions",
      "settings",
      "addons",
    ]);
    const json = tabRow("lumi:tab", HubTabs, "home").toJSON();
    expect(json.components).toHaveLength(5);
  });

  it("clips button labels to the label limit", () => {
    const long = "x".repeat(ButtonLabelLimit + 20);
    const setting = settingRow("line", { customId: "x", label: long }).toJSON();
    expect(
      (setting.accessory as APIButtonComponentWithCustomId).label,
    ).toHaveLength(ButtonLabelLimit);
    const nav = navRow({
      backId: "b",
      action: { customId: "a", label: long },
    }).toJSON();
    expect(
      (nav.components[1] as APIButtonComponentWithCustomId).label,
    ).toHaveLength(ButtonLabelLimit);
  });

  it("keeps sections within the line limit", () => {
    const lines = ["a", "b", "c", "d", "e"];
    const json = settingRow(lines, { customId: "x", label: "y" }).toJSON();
    expect(json.components).toHaveLength(SectionLineLimit);
  });
});
