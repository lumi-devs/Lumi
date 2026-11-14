import { ButtonStyle } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  createActionButton,
  createPaginationRow,
  createStringSelectMenu,
  formatTimestamp,
  SelectOptionLimit,
} from "../../packages/ui/src/index.ts";

describe("createStringSelectMenu", () => {
  it("caps options at the Discord limit", () => {
    const menu = createStringSelectMenu({
      customId: "menu",
      options: Array.from({ length: 30 }, (_, index) => ({
        label: `Option ${index}`,
        value: `value-${index}`,
      })),
    });

    expect(menu.options).toHaveLength(SelectOptionLimit);
    expect(() => menu.toJSON()).not.toThrow();
  });

  it("clips text fields and clamps value ranges", () => {
    const menu = createStringSelectMenu({
      customId: "menu",
      placeholder: "p".repeat(150),
      minValues: 40,
      maxValues: 50,
      options: Array.from({ length: 3 }, (_, index) => ({
        label: `l${index}`.repeat(60),
        value: `v${index}`.repeat(60),
        description: "d".repeat(150),
      })),
    });
    const json = menu.toJSON();

    expect(json.placeholder).toHaveLength(100);
    expect(json.options).toHaveLength(3);
    for (const option of json.options) {
      expect(option.label).toHaveLength(100);
      expect(option.value).toHaveLength(100);
      expect(option.description).toHaveLength(100);
    }
    expect(json.min_values).toBe(3);
    expect(json.max_values).toBe(3);
  });

  it("drops duplicate option values", () => {
    const menu = createStringSelectMenu({
      customId: "menu",
      options: [
        { label: "First", value: "same" },
        { label: "Second", value: "same" },
        { label: "Third", value: "other" },
      ],
    });

    expect(menu.options.map((option) => option.data.value)).toEqual([
      "same",
      "other",
    ]);
  });
});

describe("createPaginationRow", () => {
  it("clamps out-of-range pages", () => {
    const row = createPaginationRow({
      customIdPrefix: "page",
      currentPage: 99,
      totalPages: 3,
    });
    const components = row.toJSON().components;

    expect(components[1]).toMatchObject({ label: "3 / 3" });
    expect(components[0]).toMatchObject({
      custom_id: "page:prev:1",
      disabled: false,
    });
    expect(components[2]).toMatchObject({ disabled: true });
  });

  it("treats an empty page range as one page", () => {
    const row = createPaginationRow({
      customIdPrefix: "page",
      currentPage: -5,
      totalPages: 0,
    });
    const components = row.toJSON().components;

    expect(components[1]).toMatchObject({ label: "1 / 1" });
    expect(components[0]).toMatchObject({ disabled: true });
    expect(components[2]).toMatchObject({ disabled: true });
  });
});

describe("createActionButton", () => {
  it("requires an identifier", () => {
    expect(() => createActionButton({ label: "No target" })).toThrow(
      /customId or url/,
    );
  });

  it("requires visible content", () => {
    expect(() => createActionButton({ customId: "id" })).toThrow(
      /label or emoji/,
    );
  });

  it("builds link and custom-id buttons", () => {
    const link = createActionButton({
      url: "https://example.test",
      label: "Open",
    });
    const action = createActionButton({
      customId: "action",
      emoji: "✅",
    });

    expect(link.toJSON()).toMatchObject({ style: ButtonStyle.Link });
    expect(action.toJSON()).toMatchObject({ custom_id: "action" });
  });
});

describe("formatTimestamp", () => {
  it("renders Discord timestamps in the requested style", () => {
    const date = new Date("2026-10-30T12:00:00.000Z");
    expect(formatTimestamp(date, "F")).toBe("<t:1793361600:F>");
    expect(formatTimestamp(date.toISOString(), "R")).toBe("<t:1793361600:R>");
  });

  it("returns a placeholder for invalid dates", () => {
    expect(formatTimestamp("not-a-date")).toBe("—");
  });
});
