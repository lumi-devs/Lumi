import type { ConfigField } from "@lumi/module-runtime";
import { describe, expect, it } from "vitest";
import { fieldPages } from "../../src/admin/panel/configFields.ts";

function field(key: string, category?: string): ConfigField {
  return { key, label: key, type: "string", category };
}

describe("fieldPages", () => {
  it("groups fields by category and preserves their order", () => {
    const pages = fieldPages(
      [
        field("formula", "XP"),
        field("xp", "XP"),
        field("voice", "Voice"),
        field("multiplier", "Multipliers"),
        field("channel", "Multipliers"),
        field("role", "Multipliers"),
        field("ignored", "Multipliers"),
        field("other", "Multipliers"),
      ],
      2,
    );

    expect(pages.map((page) => page.label)).toEqual([
      "XP",
      "Voice",
      "Multipliers 1/3",
      "Multipliers 2/3",
      "Multipliers 3/3",
    ]);
    expect(pages.map((page) => page.fields.map((item) => item.key))).toEqual([
      ["formula", "xp"],
      ["voice"],
      ["multiplier", "channel"],
      ["role", "ignored"],
      ["other"],
    ]);
  });

  it("uses General for fields without a category", () => {
    expect(fieldPages([field("one"), field("two")], 4)).toEqual([
      {
        label: "General",
        fields: [field("one"), field("two")],
      },
    ]);
  });

  it("returns one empty page when there are no fields", () => {
    expect(fieldPages([], 4)).toEqual([{ label: "General", fields: [] }]);
  });
});
