// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import type { ActionResult } from "#/actions/guild-actions";

const setManyGuildConfigFields = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/guild-actions", () => ({
  setManyGuildConfigFields,
}));

const { SetupWizard } = await import("#/components/guild/setup-wizard");

function channel(key: string, label: string): ConfigField {
  return { key, label, type: FieldType.Channel, description: `${label} description.` };
}

function role(key: string, label: string): ConfigField {
  return { key, label, type: FieldType.Role, description: `${label} description.` };
}

function bool(key: string, label: string): ConfigField {
  return { key, label, type: FieldType.Boolean, description: `${label} description.` };
}

function num(key: string, label: string): ConfigField {
  return { key, label, type: FieldType.Number, description: `${label} description.` };
}

function enumField(key: string, label: string, choices: string[]): ConfigField {
  return { key, label, type: FieldType.Enum, description: `${label} description.`, choices };
}

const securityFields: ConfigField[] = [
  channel("log_channel_id", "Security Log Channel"),
  bool("verification_enabled", "Verification"),
  role("verified_role_id", "Verified Role"),
  enumField("verification_mode", "Verification Mode", ["emoji", "none", "web"]),
  enumField("verification_target", "Verification Target", ["everyone", "suspicious"]),
  bool("joingate_enabled", "Join Gate"),
  num("min_account_age_hours", "Min Account Age (hours)"),
  num("raid_join_count", "Raid Join Count"),
  enumField("raid_action", "Gate Action", ["kick", "timeout", "quarantine"]),
];

const modFields: ConfigField[] = [
  channel("log_channel_id", "Mod Log Channel"),
  role("quarantine_role_id", "Quarantine Role"),
];

const roles = [
  { id: "role-1", name: "Quarantined", color: 0, position: 1, permissions: "0", isBotRole: false },
  { id: "role-2", name: "Verified", color: 0, position: 2, permissions: "0", isBotRole: false },
];

const channels = [
  { id: "chan-1", name: "logs", type: 0 },
  { id: "chan-2", name: "mod-log", type: 0 },
];

function renderWizard(
  securityConfig: Record<string, unknown> = {},
  modConfig: Record<string, unknown> = {},
) {
  return render(
    <SetupWizard
      guildId="guild-1"
      securityFields={securityFields}
      securityConfig={securityConfig}
      modFields={modFields}
      modConfig={modConfig}
      roles={roles}
      channels={channels}
    />,
  );
}

describe("SetupWizard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the welcome stop with a five-stop progress checklist", () => {
    renderWizard();
    expect(
      screen.getByRole("heading", { name: "Step 1 of 5: Welcome" }),
    ).toBeInTheDocument();
    for (const title of [
      "Welcome",
      "Log channels",
      "Verification",
      "Join gate",
      "Review & finish",
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
  });

  it("saves the log-channels stop with one setMany call per module, then advances", async () => {
    setManyGuildConfigFields.mockResolvedValue({ ok: true });
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(
      screen.getByRole("heading", { name: "Step 2 of 5: Log channels" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Security Log Channel"), {
      target: { value: "chan-1" },
    });
    fireEvent.change(screen.getByLabelText("Mod Log Channel"), {
      target: { value: "chan-2" },
    });
    fireEvent.change(screen.getByLabelText("Quarantine Role"), {
      target: { value: "role-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(setManyGuildConfigFields).toHaveBeenCalledTimes(2));
    expect(setManyGuildConfigFields).toHaveBeenCalledWith("guild-1", "security", {
      log_channel_id: "chan-1",
    });
    expect(setManyGuildConfigFields).toHaveBeenCalledWith("guild-1", "mod", {
      log_channel_id: "chan-2",
      quarantine_role_id: "role-1",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Step 3 of 5: Verification" }),
      ).toBeInTheDocument(),
    );
  });

  it("walks a configured server to review and links back to the overview", async () => {
    renderWizard(
      {
        log_channel_id: "chan-1",
        verification_enabled: true,
        verified_role_id: "role-2",
        verification_mode: "emoji",
        verification_target: "everyone",
        joingate_enabled: true,
        min_account_age_hours: 24,
        raid_join_count: 10,
        raid_action: "kick",
      },
      { log_channel_id: "chan-2", quarantine_role_id: "role-1" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    for (let stop = 0; stop < 3; stop += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
    }

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Step 5 of 5: Review & finish" }),
      ).toBeInTheDocument(),
    );
    expect(setManyGuildConfigFields).not.toHaveBeenCalled();
    expect(screen.getAllByText("Configured.")).toHaveLength(3);

    const finish = screen.getByRole("link", { name: "Back to overview" });
    expect(finish).toHaveAttribute("href", "/guild/guild-1");

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(
      screen.getByRole("heading", { name: "Step 2 of 5: Log channels" }),
    ).toBeInTheDocument();
  });

  it("surfaces a save failure without advancing", async () => {
    setManyGuildConfigFields.mockResolvedValue({ ok: false, error: "Nope." });
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    fireEvent.change(screen.getByLabelText("Security Log Channel"), {
      target: { value: "chan-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(screen.getByText("Nope.")).toBeInTheDocument());
    expect(
      screen.getByRole("heading", { name: "Step 2 of 5: Log channels" }),
    ).toBeInTheDocument();
  });
});
