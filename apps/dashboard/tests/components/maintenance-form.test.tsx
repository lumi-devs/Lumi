// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ActionResult } from "#/actions/guild-actions";

const setMaintenanceMode = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/system-actions", () => ({ setMaintenanceMode }));

const { MaintenanceForm } = await import(
  "#/components/system/maintenance-form"
);

describe("MaintenanceForm (system panel maintenance-mode toggle)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reflects the initial maintenanceMode/message props", () => {
    render(
      <MaintenanceForm maintenanceMode={true} maintenanceMessage="Back soon" />,
    );
    expect(screen.getByRole("switch", { name: /toggle maintenance mode/i })).toBeChecked();
    expect(screen.getByPlaceholderText(/scheduled maintenance/i)).toHaveValue(
      "Back soon",
    );
  });

  it("calls setMaintenanceMode immediately when the switch is toggled on", async () => {
    setMaintenanceMode.mockResolvedValue({ ok: true });
    render(<MaintenanceForm maintenanceMode={false} maintenanceMessage={null} />);

    fireEvent.click(screen.getByRole("switch", { name: /toggle maintenance mode/i }));

    await waitFor(() =>
      expect(setMaintenanceMode).toHaveBeenCalledWith(true, undefined),
    );
  });

  it("sends the downtime message text along with the toggle state", async () => {
    setMaintenanceMode.mockResolvedValue({ ok: true });
    render(<MaintenanceForm maintenanceMode={false} maintenanceMessage={null} />);

    fireEvent.change(screen.getByPlaceholderText(/scheduled maintenance/i), {
      target: { value: "Down for upgrades" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setMaintenanceMode).toHaveBeenCalledWith(false, "Down for upgrades"),
    );
  });

  it("shows an error when the action fails", async () => {
    setMaintenanceMode.mockResolvedValue({ ok: false, error: "RPC timed out" });
    render(<MaintenanceForm maintenanceMode={false} maintenanceMessage={null} />);

    fireEvent.click(screen.getByRole("switch", { name: /toggle maintenance mode/i }));

    expect(await screen.findByText("RPC timed out")).toBeInTheDocument();
  });
});
