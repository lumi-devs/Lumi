import { describe, it, expect, vi, beforeEach } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { guildActionsMock } from "../setup";

const { setGuildConfigField, setManyGuildConfigFields } = guildActionsMock;

const { AntiNukeCard } = await import("#/components/guild/anti-nuke-card");

const NukeResponses = ["log", "quarantine", "ban"];

function num(key: string, label: string): ConfigField {
  return { key, label, type: FieldType.Number, description: `${label} description.`, group: "Nuke Limits" };
}

function response(key: string, label: string): ConfigField {
  return {
    key,
    label,
    type: FieldType.Enum,
    description: `${label} description.`,
    choices: NukeResponses,
    group: "Nuke Limits",
  };
}

/** Mirrors the security module's anti-nuke schema: 8 `max_*` limits, 5
 * `response_*` counterparts (vanity / permission grants / quarantine bypass
 * are limit-only). */
const configFields: ConfigField[] = [
  { key: "antinuke_enabled", label: "Anti-Nuke", type: FieldType.Boolean, description: "Watch the audit log.", group: "Anti-Nuke" },
  { key: "window_seconds", label: "Detection Window", type: FieldType.Number, description: "Detection Window description.", group: "Anti-Nuke" },
  { key: "trusted_role_ids", label: "Trusted Roles", type: FieldType.MultiRole, description: "Exempt roles.", group: "Anti-Nuke" },
  { key: "log_channel_id", label: "Security Log Channel", type: FieldType.Channel, description: "Alerts go here.", group: "Anti-Nuke" },
  num("max_bans", "Max Bans"),
  response("response_bans", "Response — Bans"),
  num("max_kicks", "Max Kicks"),
  response("response_kicks", "Response — Kicks"),
  num("max_channel_deletes", "Max Channel Deletes"),
  response("response_channel_deletes", "Response — Channel Deletes"),
  num("max_role_deletes", "Max Role Deletes"),
  response("response_role_deletes", "Response — Role Deletes"),
  num("max_webhook_creates", "Max Webhook Creates"),
  response("response_webhook_creates", "Response — Webhook Creates"),
  num("max_vanity_changes", "Max Vanity URL Changes"),
  num("max_permission_grants", "Max Dangerous Permission Grants"),
  num("max_quarantine_bypass", "Max Quarantine Bypass Attempts"),
];

const config: Record<string, unknown> = {
  antinuke_enabled: true,
  window_seconds: 60,
  trusted_role_ids: ["111"],
  log_channel_id: "333",
  max_bans: 5,
  response_bans: "quarantine",
  max_kicks: 5,
  response_kicks: "quarantine",
  max_channel_deletes: 3,
  response_channel_deletes: "quarantine",
  max_role_deletes: 3,
  response_role_deletes: "quarantine",
  max_webhook_creates: 3,
  response_webhook_creates: "quarantine",
  max_vanity_changes: 1,
  max_permission_grants: 1,
  max_quarantine_bypass: 1,
};

const roles = [
  { id: "111", name: "Moderators", color: 0, position: 2, permissions: "0", isBotRole: false },
  { id: "222", name: "Helpers", color: 0, position: 1, permissions: "0", isBotRole: false },
];

const channels = [
  { id: "333", name: "mod-log", type: 0 },
  { id: "444", name: "voice", type: 2 },
];

function renderCard() {
  return render(
    <AntiNukeCard
      guildId="guild-1"
      config={config}
      configFields={configFields}
      roles={roles}
      channels={channels}
    />,
  );
}

describe("AntiNukeCard (schema-driven nuke matrix)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders one limit row per schema max_* key", () => {
    renderCard();
    for (const label of [
      "Bans",
      "Kicks",
      "Channel Deletes",
      "Role Deletes",
      "Webhook Creates",
      "Vanity URL Changes",
      "Dangerous Permission Grants",
      "Quarantine Bypass Attempts",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders a response select only where the schema carries a response_* key", () => {
    renderCard();
    const triggers = screen.getAllByRole("combobox");
    expect(triggers.filter((t) => t.textContent === "quarantine")).toHaveLength(5);
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("edits trusted roles through the roles directory, not free text", () => {
    renderCard();
    expect(screen.getByText("@Moderators")).toBeInTheDocument();
    fireEvent.focus(screen.getByRole("combobox", { name: "Trusted Roles" }));
    expect(screen.getByRole("option", { name: "@Helpers" })).toBeInTheDocument();
    expect(screen.queryByText(/comma-separated/i)).not.toBeInTheDocument();
  });

  it("saves only changed fields in a single setMany call", async () => {
    setManyGuildConfigFields.mockResolvedValue({ ok: true });
    renderCard();
    fireEvent.change(screen.getByLabelText("Bans"), { target: { value: "9" } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(setManyGuildConfigFields).toHaveBeenCalledTimes(1));
    expect(setManyGuildConfigFields).toHaveBeenCalledWith("guild-1", "security", {
      max_bans: 9,
    });
  });

  it("toggles anti-nuke immediately from the header switch", async () => {
    setGuildConfigField.mockResolvedValue({ ok: true });
    renderCard();
    fireEvent.click(screen.getByRole("switch", { name: "Toggle anti-nuke" }));
    await waitFor(() => expect(setGuildConfigField).toHaveBeenCalledTimes(1));
    expect(setGuildConfigField).toHaveBeenCalledWith(
      "guild-1",
      "security",
      "antinuke_enabled",
      false,
    );
  });
});
