import { describe, it, expect } from "vitest";
import type { ContainerBuilder } from "@discordjs/builders";
import { moduleUpdateResultCard } from "#lib/downloader/cards.js";

/** Flattens all text-display content in a container into a single string for substring assertions. */
function textOf(container: ContainerBuilder): string {
  const data = container.toJSON() as {
    components: { type: number; content?: string }[];
  };
  return data.components
    .filter((c) => c.type === 10)
    .map((c) => c.content)
    .join("\n");
}

/** Returns the action-row components (type 1) present in the container, if any. */
function actionRowsOf(container: ContainerBuilder) {
  const data = container.toJSON() as {
    components: { type: number; components?: { custom_id?: string }[] }[];
  };
  return data.components.filter((c) => c.type === 1);
}

describe("downloader/cards moduleUpdateResultCard", () => {
  it("returns up-to-date card when result.updated is false", () => {
    const card = moduleUpdateResultCard(
      { updated: false },
      "test-module",
      "user-123"
    );

    const container = card.components[0] as ContainerBuilder;
    const text = textOf(container);
    expect(text).toContain("Module Up-To-Date");
    expect(text).toContain("**test-module** is already running the latest version!");

    // No restart choice is offered when nothing was updated.
    expect(actionRowsOf(container)).toHaveLength(0);
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

    const container = card.components[0] as ContainerBuilder;
    const text = textOf(container);
    expect(text).toContain("Module Updated");
    expect(text).toContain("Updated **test-module** on disk");
    expect(text).toContain("a restart is needed to load it");
    expect(text).toContain("### Pull Changelog:");
    expect(text).toContain("Fix bug in handler");

    const rows = actionRowsOf(container);
    expect(rows).toHaveLength(1);
    const customIds = rows[0]?.components?.map((c) => c.custom_id);
    expect(customIds).toEqual([
      "module:restart:user-123",
      "module:restartcancel:user-123",
    ]);
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

    const container = card.components[0] as ContainerBuilder;
    const text = textOf(container);
    expect(text).toContain("Module Updated");
    expect(text).toContain("a restart is needed to load it");
    expect(text).toContain("No changelog details provided.");
    expect(text).not.toContain("### Pull Changelog:");

    const rows = actionRowsOf(container);
    expect(rows).toHaveLength(1);
    const customIds = rows[0]?.components?.map((c) => c.custom_id);
    expect(customIds).toEqual([
      "module:restart:user-123",
      "module:restartcancel:user-123",
    ]);
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

    const container = card.components[0] as ContainerBuilder;
    const text = textOf(container);
    expect(text).toContain("Module Updated");
    expect(text).toContain("Successfully updated and hot-reloaded **test-module**!");
    expect(text).toContain("### Pull Changelog:");
    expect(text).toContain("Updated feature");
    expect(text).not.toContain("a restart is needed to load it");

    // Hot-reloaded modules don't need a restart choice.
    expect(actionRowsOf(container)).toHaveLength(0);
  });
});
