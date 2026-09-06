// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import type { ActionResult } from "#/actions/guild-actions";

const setManyGuildConfigFields = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/guild-actions", () => ({
  setManyGuildConfigFields,
}));

const { JoinGateCard } = await import("#/components/guild/join-gate-card");

const GateActions = ["log", "kick", "timeout", "quarantine"];

function bool(key: string, label: string, group: string): ConfigField {
  return { key, label, type: FieldType.BOOLEAN, description: `${label} description.`, group };
}

function num(key: string, label: string, group: string): ConfigField {
  return { key, label, type: FieldType.NUMBER, description: `${label} description.`, group };
}

function gateAction(key: string, label: string, group: string, choices: string[] = GateActions): ConfigField {
  return { key, label, type: FieldType.ENUM, description: `${label} description.`, choices, group };
}

/** Mirrors the security module's join-gate / filter / verification schema. */
const configFields: ConfigField[] = [
  bool("joingate_enabled", "Join Gate", "Join Gate"),
  num("min_account_age_hours", "Min Account Age (hours)", "Join Gate"),
  num("raid_join_count", "Raid Join Count", "Join Gate"),
  num("raid_window_seconds", "Raid Window (seconds)", "Join Gate"),
  gateAction("raid_action", "Gate Action", "Join Gate", ["kick", "timeout", "quarantine"]),
  gateAction("raid_account_type", "Raid Response Scope", "Join Gate", ["all", "suspicious"]),
  { key: "raid_warn_role_ids", label: "Raid Warn Roles", type: FieldType.MULTI_ROLE, description: "Mentioned on raid mode.", group: "Join Gate" },
  bool("filter_no_avatar_enabled", "Filter: No Avatar", "Join Gate Filters"),
  gateAction("filter_no_avatar_action", "No Avatar Action", "Join Gate Filters"),
  bool("filter_min_age_enabled", "Filter: Min Account Age", "Join Gate Filters"),
  num("filter_min_age_hours", "Min Account Age (hours)", "Join Gate Filters"),
  gateAction("filter_min_age_action", "Min Age Action", "Join Gate Filters"),
  bool("filter_unverified_bot_enabled", "Filter: Unverified Bots", "Join Gate Filters"),
  gateAction("filter_unverified_bot_action", "Unverified Bot Action", "Join Gate Filters"),
  bool("filter_username_pattern_enabled", "Filter: Username Pattern", "Join Gate Filters"),
  { key: "filter_username_pattern", label: "Username Patterns", type: FieldType.STRING_LIST, description: "Substrings.", group: "Join Gate Filters" },
  gateAction("filter_username_pattern_action", "Username Pattern Action", "Join Gate Filters"),
  bool("filter_advertising_enabled", "Filter: Advertising Account", "Join Gate Filters"),
  gateAction("filter_advertising_action", "Advertising Account Action", "Join Gate Filters"),
  bool("verification_enabled", "Verification", "Verification"),
  { key: "verified_role_id", label: "Verified Role", type: FieldType.ROLE, description: "Granted on pass.", group: "Verification" },
  { key: "verification_pending_role_id", label: "Pending Role", type: FieldType.ROLE, description: "Assigned on join.", group: "Verification" },
  num("verification_timeout_minutes", "Verify Timeout (minutes)", "Verification"),
  bool("verification_kick_on_timeout", "Kick on Timeout", "Verification"),
  gateAction("verification_mode", "Verification Mode", "Verification", ["emoji", "none", "web"]),
  gateAction("verification_target", "Verification Target", "Verification", ["everyone", "suspicious"]),
];

const config: Record<string, unknown> = {
  joingate_enabled: true,
  min_account_age_hours: 0,
  raid_join_count: 10,
  raid_window_seconds: 30,
  raid_action: "kick",
  raid_account_type: "all",
  raid_warn_role_ids: [],
  filter_no_avatar_enabled: false,
  filter_no_avatar_action: "log",
  filter_min_age_enabled: false,
  filter_min_age_hours: 0,
  filter_min_age_action: "kick",
  filter_unverified_bot_enabled: false,
  filter_unverified_bot_action: "kick",
  filter_username_pattern_enabled: false,
  filter_username_pattern: [],
  filter_username_pattern_action: "log",
  filter_advertising_enabled: false,
  filter_advertising_action: "kick",
  verification_enabled: false,
  verified_role_id: null,
  verification_pending_role_id: null,
  verification_timeout_minutes: 10,
  verification_kick_on_timeout: false,
  verification_mode: "emoji",
  verification_target: "everyone",
};

const roles = [
  { id: "111", name: "Moderators", color: 0, position: 2, permissions: "0", isBotRole: false },
];

function renderCard() {
  return render(
    <JoinGateCard
      guildId="guild-1"
      config={config}
      configFields={configFields}
      roles={roles}
    />,
  );
}

describe("JoinGateCard (schema-driven filter matrix)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the full join-gate, filter, and verification matrix from the schema", () => {
    renderCard();
    for (const heading of ["Join Gate", "Join Gate Filters", "Verification"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    for (const label of [
      "Raid Response Scope",
      "Raid Warn Roles",
      "Filter: No Avatar",
      "No Avatar Action",
      "Filter: Min Account Age",
      "Filter: Unverified Bots",
      "Filter: Username Pattern",
      "Username Patterns",
      "Filter: Advertising Account",
      "Verified Role",
      "Pending Role",
      "Verification Mode",
      "Verification Target",
      "Kick on Timeout",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("edits role lists through the roles directory", () => {
    renderCard();
    expect(screen.getByRole("option", { name: "@Moderators" })).toBeInTheDocument();
  });

  it("saves only changed fields in a single setMany call", async () => {
    setManyGuildConfigFields.mockResolvedValue({ ok: true });
    renderCard();
    const candidates = screen.getAllByDisplayValue("kick");
    fireEvent.change(candidates[0] as HTMLElement, { target: { value: "quarantine" } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(setManyGuildConfigFields).toHaveBeenCalledTimes(1));
    expect(setManyGuildConfigFields).toHaveBeenCalledWith("guild-1", "security", {
      raid_action: "quarantine",
    });
  });
});
