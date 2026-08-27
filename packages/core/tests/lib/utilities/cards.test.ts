import { describe, it, expect } from "vitest";
import type { ContainerBuilder } from "@discordjs/builders";
import { makeListCard,
  fitLines,
  TEXT_DISPLAY_LIMIT,
} from "#lib/utilities/cards.js";

describe("cards utility makeListCard", () => {
  it("formats empty item list correctly", () => {
    const card = makeListCard("Empty List", []);
    const container = card.components[0] as ContainerBuilder;
    const data = container.toJSON() as { components: { type: number; content?: string }[] };
    const textDisplays = data.components.filter((c) => c.type === 10);
    const content = textDisplays.map((c) => c.content).join("\n");

    expect(content).toContain("## Empty List");
    expect(content).toContain("-# *No items to display.*");
  });

  it("joins multiple list items into a single bulleted block without creating extra separators per item", () => {
    const items = Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`);
    const card = makeListCard("Multiple Items", items);
    const container = card.components[0] as ContainerBuilder;
    const data = container.toJSON() as { components: { type: number; content?: string }[] };
    
    // Type 10 is TextDisplay, Type 9 is Separator
    const separators = data.components.filter((c) => c.type === 9);
    
    // There should be only standard header separator, not 20+ separator components
    expect(separators.length).toBeLessThan(5);
    
    const textDisplays = data.components.filter((c) => c.type === 10);
    const bodyContent = textDisplays.map((c) => c.content).join("\n");
    expect(bodyContent).toContain("• Item 1");
    expect(bodyContent).toContain("• Item 20");
  });

  it("truncates at maxVisibleItems (25) and shows overflow notice", () => {
    const items = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`);
    const card = makeListCard("Overflow List", items);
    const container = card.components[0] as ContainerBuilder;
    const data = container.toJSON() as { components: { type: number; content?: string }[] };
    const textDisplays = data.components.filter((c) => c.type === 10);
    const bodyContent = textDisplays.map((c) => c.content).join("\n");

    expect(bodyContent).toContain("• Item 25");
    expect(bodyContent).not.toContain("• Item 26");
    expect(bodyContent).toContain("-# ...and 5 more item(s).");
  });
});

describe("fitLines", () => {
  it("passes short content through unchanged", () => {
    expect(fitLines(["a", "b", "c"])).toBe("a\nb\nc");
  });

  it("keeps the body within the TextDisplay limit", () => {
    const lines = Array.from({ length: 50 }, () => "x".repeat(200));
    const body = fitLines(lines);

    expect(body.length).toBeLessThanOrEqual(TEXT_DISPLAY_LIMIT);
    expect(body).toContain("more item(s)");
  });

  // @discordjs/builders validates this client-side and throws, so overflowing
  // fails the whole reply rather than being truncated in transit.
  it("survives a single oversized line", () => {
    const body = fitLines(["y".repeat(9000)]);
    expect(body.length).toBeLessThanOrEqual(TEXT_DISPLAY_LIMIT);
  });
});
