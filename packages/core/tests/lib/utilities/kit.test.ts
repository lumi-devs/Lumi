import { describe, it, expect } from "vitest";
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
});
