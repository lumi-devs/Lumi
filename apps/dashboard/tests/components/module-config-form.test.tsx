// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FieldType } from "@lumi/contracts";
import type { ActionResult } from "#/actions/guild-actions";
import type { DashboardModuleView } from "#/lib/dashboard-data";

const setGuildConfigField = vi.fn<() => Promise<ActionResult>>();
const toggleGuildModule = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/guild-actions", () => ({
  setGuildConfigField,
  toggleGuildModule,
}));

const { ModuleConfigForm } = await import(
  "#/components/guild/module-config-form"
);

function makeModule(): DashboardModuleView {
  return {
    name: "security",
    displayName: "Security",
    emoji: "🔐",
    description: "Anti-nuke and permit controls.",
    version: "1.0.0",
    conflicts: [],
    dependencies: [],
    enabled: true,
    configFields: [
      {
        key: "modRoleId",
        label: "Mod Role",
        type: FieldType.ROLE,
        description: "Role that can moderate.",
      },
      {
        key: "verbose",
        label: "Verbose Logging",
        type: FieldType.BOOLEAN,
        description: "",
      },
    ],
    config: { modRoleId: "", verbose: false },
    isAddon: false,
    category: "Security",
    dashboardHref: null,
  };
}

const roles = [{ id: "555555555555555555", name: "Moderators", color: 0, position: 0, permissions: "0", isBotRole: false }];
const channels: never[] = [];

describe("ModuleConfigForm (dynamic config form editor + save bar)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides the save bar until a field is edited", () => {
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeModule()}
        roles={roles}
        channels={channels}
      />,
    );
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("shows the save bar once a field value changes, and hides it again on Reset", async () => {
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeModule()}
        roles={roles}
        channels={channels}
      />,
    );

    const roleInput = screen.getByLabelText("Mod Role");
    fireEvent.change(roleInput, { target: { value: "555555555555555555" } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => {
      expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Mod Role")).toHaveValue("");
    });
  });

  it("on save, only sends the field(s) that actually changed", async () => {
    setGuildConfigField.mockResolvedValue({ ok: true });
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeModule()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.change(screen.getByLabelText("Mod Role"), {
      target: { value: "555555555555555555" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(setGuildConfigField).toHaveBeenCalledWith(
        "101",
        "security",
        "modRoleId",
        "555555555555555555",
      ),
    );
    // "verbose" was never touched — must not be sent.
    expect(setGuildConfigField).toHaveBeenCalledTimes(1);
  });

  it("saves every changed field when more than one was edited", async () => {
    setGuildConfigField.mockResolvedValue({ ok: true });
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeModule()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.change(screen.getByLabelText("Mod Role"), {
      target: { value: "555555555555555555" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Verbose Logging" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(setGuildConfigField).toHaveBeenCalledTimes(2));
    expect(setGuildConfigField).toHaveBeenCalledWith(
      "101",
      "security",
      "modRoleId",
      "555555555555555555",
    );
    expect(setGuildConfigField).toHaveBeenCalledWith(
      "101",
      "security",
      "verbose",
      true,
    );
  });

  it("shows an error and keeps the save bar open when a save fails", async () => {
    setGuildConfigField.mockResolvedValue({ ok: false, error: "Bad payload" });
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeModule()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.change(screen.getByLabelText("Mod Role"), {
      target: { value: "555555555555555555" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Bad payload")).toBeInTheDocument();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("toggling the module's enable switch calls toggleGuildModule independently of the save bar", async () => {    toggleGuildModule.mockResolvedValue({ ok: true });
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeModule()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Toggle Security" }));

    await waitFor(() =>
      expect(toggleGuildModule).toHaveBeenCalledWith("101", "security", false),
    );
    // Enabling/disabling the module is a separate, instant action — it must
    // not require (or trigger) the dirty-field save bar.
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    expect(setGuildConfigField).not.toHaveBeenCalled();
  });

  it("renders ungrouped fields with no tab strip", () => {
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeModule()}
        roles={roles}
        channels={channels}
      />,
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mod Role")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Verbose Logging" })).toBeInTheDocument();
  });
});

function makeGroupedModule(): DashboardModuleView {
  const base = makeModule();
  return {
    ...base,
    configFields: [
      {
        key: "logChannelId",
        label: "Log Channel",
        type: FieldType.CHANNEL,
        description: "Where moderation events are posted.",
        group: "Logging",
      },
      {
        key: "verbose",
        label: "Verbose Logging",
        type: FieldType.BOOLEAN,
        description: "Include debug lines in the log output.",
        group: "Logging",
      },
      {
        key: "muteDuration",
        label: "Mute Duration",
        type: FieldType.DURATION,
        description: "Default mute length.",
        group: "Punishments",
      },
    ],
    config: { logChannelId: "", verbose: false, muteDuration: "15m" },
  };
}

describe("ModuleConfigForm (group tabs + search)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders one tab per group and shows only the active group's fields", () => {
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeGroupedModule()}
        roles={roles}
        channels={channels}
      />,
    );

    const tablist = screen.getByRole("tablist", { name: /setting groups/i });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /logging/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /punishments/i })).toHaveAttribute("aria-selected", "false");

    expect(screen.getByLabelText("Log Channel")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mute Duration")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /punishments/i }));
    expect(screen.getByLabelText("Mute Duration")).toBeInTheDocument();
    expect(screen.queryByLabelText("Log Channel")).not.toBeInTheDocument();
  });

  it("filters fields by label or description text", () => {
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeGroupedModule()}
        roles={roles}
        channels={channels}
      />,
    );

    // "debug lines" only appears in the Verbose Logging description, which
    // lives in the non-active group — search must surface it anyway.
    fireEvent.change(screen.getByLabelText(/search .* settings/i), {
      target: { value: "debug lines" },
    });
    expect(screen.getByLabelText("Verbose Logging")).toBeInTheDocument();
    expect(screen.queryByLabelText("Log Channel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mute Duration")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches the search", () => {
    render(
      <ModuleConfigForm
        guildId="101"
        module={makeGroupedModule()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.change(screen.getByLabelText(/search .* settings/i), {
      target: { value: "zzz-no-such-setting" },
    });
    expect(screen.getByText(/no matching settings/i)).toBeInTheDocument();
  });
});
