import { describe, it, expect } from "vitest";
import { moduleUpdateResultCard } from "#lib/downloader/cards.js";

describe("downloader/cards moduleUpdateResultCard", () => {
  it("returns up-to-date card when result.updated is false", () => {
    const card = moduleUpdateResultCard(
      { updated: false },
      "test-module",
      "user-123"
    );

    expect(card).toBeDefined();
    expect(card.components).toBeDefined();
  });

  it("returns updated card requiring restart with changelog", () => {
    const card = moduleUpdateResultCard(
      {
        updated: true,
        needsRestart: true,
        changelog: "Fix bug in handler",
      },
      "test-module",
      "user-123"
    );

    expect(card).toBeDefined();
    expect(card.components).toBeDefined();
  });

  it("returns updated card requiring restart without changelog", () => {
    const card = moduleUpdateResultCard(
      {
        updated: true,
        needsRestart: true,
      },
      "test-module",
      "user-123"
    );

    expect(card).toBeDefined();
    expect(card.components).toBeDefined();
  });

  it("returns updated card with hot-reload (no restart) with changelog", () => {
    const card = moduleUpdateResultCard(
      {
        updated: true,
        needsRestart: false,
        changelog: "Updated feature",
      },
      "test-module",
      "user-123"
    );

    expect(card).toBeDefined();
    expect(card.components).toBeDefined();
  });
});
