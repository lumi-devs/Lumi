// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { ConfigFieldInput } from "#/components/guild/config-field-input";
import type { DashboardRoleView, DashboardChannelView } from "#/lib/dashboard-data";

const roles: DashboardRoleView[] = [
  { id: "111", name: "Moderators", color: 0, position: 2, permissions: "0", isBotRole: false },
  { id: "222", name: "Helpers", color: 0, position: 1, permissions: "0", isBotRole: false },
];

const channels: DashboardChannelView[] = [
  { id: "333", name: "mod-log", type: 0 },
  { id: "444", name: "general", type: 0 },
];

function field(overrides: Partial<ConfigField>): ConfigField {
  return {
    key: "testKey",
    label: "Test Field",
    type: FieldType.String,
    description: "A test field.",
    ...overrides,
  };
}

describe("ConfigFieldInput", () => {
  it("NUMBER with step renders a slider with a value readout", () => {
    const onChange = vi.fn();
    render(
      <ConfigFieldInput
        field={field({ key: "limit", label: "Limit", type: FieldType.Number, step: 5 })}
        value={25}
        onChange={onChange}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Limit" });
    expect(slider).toHaveAttribute("step", "5");
    expect(screen.getByText("25")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "30" } });
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it("NUMBER without step renders a plain number box", () => {
    const onChange = vi.fn();
    render(
      <ConfigFieldInput
        field={field({ key: "limit", label: "Limit", type: FieldType.Number })}
        value={7}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("spinbutton")).toHaveValue(7);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("DURATION renders quick-pick chips that write the value", () => {
    const onChange = vi.fn();
    render(
      <ConfigFieldInput
        field={field({
          key: "muteDuration",
          label: "Mute Duration",
          type: FieldType.Duration,
          quickPicks: ["5m", "15m", "1h"],
        })}
        value="5m"
        onChange={onChange}
      />,
    );

    expect(screen.getByPlaceholderText("e.g. 15m")).toHaveValue("5m");
    const activePick = screen.getByRole("button", { name: "5m" });
    expect(activePick).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "1h" }));
    expect(onChange).toHaveBeenCalledWith("1h");
  });

  it("MULTI_ROLE lists guild roles and resolves selected names", () => {
    const onChange = vi.fn();
    render(
      <ConfigFieldInput
        field={field({ key: "pingRoles", label: "Ping Roles", type: FieldType.MultiRole })}
        value={["111"]}
        onChange={onChange}
        roles={roles}
        channels={channels}
      />,
    );

    expect(screen.getByRole("option", { name: "@Moderators" })).toBeInTheDocument();
    expect(screen.getAllByText("@Moderators").length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByLabelText("Add ID to Ping Roles"), {
      target: { value: "999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledWith(["111", "999"]);
  });

  it("MULTI_CHANNEL lists guild channels and accepts unknown IDs", () => {
    const onChange = vi.fn();
    render(
      <ConfigFieldInput
        field={field({ key: "watchChannels", label: "Watch Channels", type: FieldType.MultiChannel })}
        value={[]}
        onChange={onChange}
        roles={roles}
        channels={channels}
      />,
    );

    expect(screen.getByRole("option", { name: "#mod-log" })).toBeInTheDocument();
    expect(screen.getByText("Empty list")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Add ID to Watch Channels"), {
      target: { value: "555" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledWith(["555"]);
  });

  it("MULTI_USER accepts IDs through the add box", () => {
    const onChange = vi.fn();
    render(
      <ConfigFieldInput
        field={field({ key: "watchUsers", label: "Watch Users", type: FieldType.MultiUser })}
        value={[]}
        onChange={onChange}
        roles={roles}
        channels={channels}
      />,
    );

    expect(screen.getByText("Empty list")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Add ID to Watch Users"), {
      target: { value: "777" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledWith(["777"]);
  });

  it("STRING_LIST adds and removes plain text entries", () => {    const onChange = vi.fn();
    const { rerender } = render(
      <ConfigFieldInput
        field={field({ key: "badTerms", label: "Bad Terms", type: FieldType.StringList })}
        value={["spam"]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("spam")).toBeInTheDocument();
    expect(screen.getByText("1 entry")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Add entry to Bad Terms"), {
      target: { value: "scam" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledWith(["spam", "scam"]);

    rerender(
      <ConfigFieldInput
        field={field({ key: "badTerms", label: "Bad Terms", type: FieldType.StringList })}
        value={["spam"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove spam" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("CHANNEL without channelTypes only offers text channels", () => {
    const onChange = vi.fn();
    const mixed: DashboardChannelView[] = [
      { id: "111", name: "mod-log", type: 0 },
      { id: "222", name: "voice", type: 2 },
      { id: "333", name: "news", type: 5 },
      { id: "444", name: "stage", type: 13 },
      { id: "555", name: "forum", type: 15 },
      { id: "666", name: "media", type: 16 },
    ];
    render(
      <ConfigFieldInput
        field={field({ key: "logChannel", label: "Log Channel", type: FieldType.Channel })}
        value={null}
        onChange={onChange}
        roles={roles}
        channels={mixed}
      />,
    );

    expect(screen.getByRole("option", { name: "#mod-log" })).toBeInTheDocument();
    for (const name of ["#voice", "#news", "#stage", "#forum", "#media"]) {
      expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
    }
  });

  it("CHANNEL with explicit channelTypes respects them", () => {
    const onChange = vi.fn();
    const mixed: DashboardChannelView[] = [
      { id: "111", name: "mod-log", type: 0 },
      { id: "222", name: "voice", type: 2 },
    ];
    render(
      <ConfigFieldInput
        field={field({
          key: "lounge",
          label: "Lounge",
          type: FieldType.Channel,
          channelTypes: [2],
        })}
        value={null}
        onChange={onChange}
        roles={roles}
        channels={mixed}
      />,
    );

    expect(screen.getByRole("option", { name: "#voice" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "#mod-log" })).not.toBeInTheDocument();
  });
});
