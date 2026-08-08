// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { ActionResult } from "#/actions/guild-actions";
import type { DashboardModuleView } from "#/lib/dashboard-data";

const toggleGuildModule = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/guild-actions", () => ({ toggleGuildModule }));

const { ModuleToggleGrid } = await import(
  "#/components/guild/module-toggle-grid"
);

function makeModule(overrides: Partial<DashboardModuleView> = {}): DashboardModuleView {
  return {
    name: "afk",
    displayName: "AFK",
    emoji: "💤",
    description: "Marks members as away.",
    enabled: true,
    configFields: [],
    config: {},
    ...overrides,
  };
}

describe("ModuleToggleGrid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders one card per module and reflects each one's enabled state", () => {
    render(
      <ModuleToggleGrid
        guildId="101"
        modules={[
          makeModule({ name: "afk", displayName: "AFK", enabled: true }),
          makeModule({ name: "filter", displayName: "Filter", enabled: false }),
        ]}
      />,
    );
    expect(screen.getByRole("switch", { name: "Toggle AFK" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Toggle Filter" })).not.toBeChecked();
  });

  it("shows the core module as always-active, with no toggle switch", () => {
    render(
      <ModuleToggleGrid
        guildId="101"
        modules={[makeModule({ name: "core", displayName: "Core", enabled: true })]}
      />,
    );
    expect(screen.getByText("Always active")).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Toggle Core" }),
    ).not.toBeInTheDocument();
  });

  it("optimistically toggles the switch, then calls the server action with the guild/module/new state", async () => {
    toggleGuildModule.mockResolvedValue({ ok: true });
    render(
      <ModuleToggleGrid
        guildId="101"
        modules={[makeModule({ name: "afk", displayName: "AFK", enabled: false })]}
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Toggle AFK" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    // Optimistic UI: flips immediately, before the action resolves.
    expect(toggle).toBeChecked();
    await waitFor(() =>
      expect(toggleGuildModule).toHaveBeenCalledWith("101", "afk", true),
    );
  });

  it("reverts the switch and shows the error when the server action fails", async () => {
    toggleGuildModule.mockResolvedValue({ ok: false, error: "Cannot disable the core module" });
    render(
      <ModuleToggleGrid
        guildId="101"
        modules={[makeModule({ name: "afk", displayName: "AFK", enabled: true })]}
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Toggle AFK" });
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked(); // optimistic flip

    await waitFor(() => expect(toggle).toBeChecked()); // reverted
    expect(
      await screen.findByText("Cannot disable the core module"),
    ).toBeInTheDocument();
  });
});
