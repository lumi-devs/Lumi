import { describe, it, expect, vi } from "bun:test";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { ConfigFieldInput, resolveTemplatePreview } from "#/components/guild/config-field-input";
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

  it("MULTI_ROLE renders selected roles as removable chips", () => {
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

    expect(screen.getByText("@Moderators")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove @Moderators" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("MULTI_ROLE offers unselected roles through the combobox", () => {
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

    fireEvent.focus(screen.getByRole("combobox", { name: "Ping Roles" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Helpers" }));
    expect(onChange).toHaveBeenCalledWith(["111", "222"]);
  });

  it("MULTI_CHANNEL lists guild channels through the combobox", () => {
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

    fireEvent.focus(screen.getByRole("combobox", { name: "Watch Channels" }));
    expect(screen.getByRole("option", { name: "#mod-log" })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("option", { name: "#general" }));
    expect(onChange).toHaveBeenCalledWith(["444"]);
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

    fireEvent.change(screen.getByLabelText("Add entry to Watch Users"), {
      target: { value: "777" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledWith(["777"]);
  });

  it("STRING template fields render an always-on live preview", () => {
    render(
      <ConfigFieldInput
        field={field({ key: "welcome_template", label: "Welcome Template", type: FieldType.String, format: "template" })}
        value="Welcome {user} to {server}! You are member #{memberCount}."
        onChange={() => {}}
      />,
    );

    expect(screen.getByText(/Welcome @Alex to Your Server/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("STRING template fields offer variable chips that insert at the cursor", () => {
    const onChange = vi.fn();
    render(
      <ConfigFieldInput
        field={field({ key: "welcome_template", label: "Welcome Template", type: FieldType.String, format: "template" })}
        value="Hi "
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Insert {user}" }));
    expect(onChange).toHaveBeenCalledWith("Hi {user}");
  });

  it("STRING template fields render a big textarea with an expandable editor", () => {
    render(
      <ConfigFieldInput
        field={field({ key: "welcome_template", label: "Welcome Template", type: FieldType.String, format: "template" })}
        value="Hello"
        onChange={() => {}}
      />,
    );

    const area = screen.getByLabelText("Welcome Template", { selector: "textarea" });
    expect(Number(area.getAttribute("rows"))).toBeGreaterThanOrEqual(5);

    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome Template editor" }));
    expect(screen.getByRole("dialog", { name: "Welcome Template editor" })).toBeInTheDocument();
  });

  it('STRING fields with format "color" render a synced swatch and hex input', () => {
    const onChange = vi.fn();
    render(
      <ConfigFieldInput
        field={field({ key: "accent", label: "Accent", type: FieldType.String, format: "color" })}
        value="#5865f2"
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("Accent color")).toHaveValue("#5865f2");
    expect(screen.getByLabelText("Accent hex value")).toHaveValue("#5865f2");

    fireEvent.change(screen.getByLabelText("Accent hex value"), {
      target: { value: "#ff0000" },
    });
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("STRING template preview leaves unknown placeholders verbatim", () => {
    expect(resolveTemplatePreview("Hi {user}, see {mystery}")).toBe("Hi @Alex, see {mystery}");
  });

  it("STRING fields that do not declare format:template render a plain input with no preview", () => {
    render(
      <ConfigFieldInput
        field={field({ key: "nickname_format", label: "Nickname Format", type: FieldType.String })}
        value="[{level}] {username}"
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByDisplayValue("[{level}] {username}"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Template variables" })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Log Channel" }));
    expect(screen.getByRole("option", { name: "#mod-log" })).toBeInTheDocument();
    for (const name of ["#voice", "#news", "#stage", "#forum", "#media"]) {
      expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("option", { name: "#mod-log" }));
    expect(onChange).toHaveBeenCalledWith("111");
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

    fireEvent.click(screen.getByRole("button", { name: "Lounge" }));
    expect(screen.getByRole("option", { name: "#voice" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "#mod-log" })).not.toBeInTheDocument();
  });

  it("OBJECT_ARRAY renders entries with subfields and add/remove", () => {
    const onChange = vi.fn();
    const entriesField = field({
      key: "entries",
      label: "Sticky Entries",
      type: FieldType.ObjectArray,
      subfields: [
        { key: "channel_id", label: "Channel", type: FieldType.Channel, description: "" },
        { key: "message", label: "Message", type: FieldType.String, description: "" },
      ],
    });
    const { rerender } = render(
      <ConfigFieldInput
        field={entriesField}
        value={[{ channel_id: "333", message: "hi" }]}
        onChange={onChange}
        roles={roles}
        channels={channels}
      />,
    );

    // Appears twice: the entry's collapsible chip header, and the Channel
    // subfield's own picker button showing the resolved channel below it.
    expect(screen.getAllByText("#mod-log").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("hi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove entry 1" }));
    expect(onChange).toHaveBeenCalledWith([]);

    rerender(
      <ConfigFieldInput
        field={entriesField}
        value={[]}
        onChange={onChange}
        roles={roles}
        channels={channels}
      />,
    );
    expect(screen.getByText("Empty list")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    expect(onChange).toHaveBeenCalledWith([{}]);
  });
});

describe("ConfigFieldInput CHANNEL claim helper", () => {
  const channelField = (claimable?: boolean) =>
    field({ key: "log_channel_id", label: "Log Channel", type: FieldType.Channel, claimable });

  it("offers the claim-code flow only when the schema declares the field claimable", () => {
    render(
      <ConfigFieldInput
        field={channelField(true)}
        value=""
        onChange={vi.fn()}
        channels={channels}
        guildId="guild-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Log Channel" }));
    expect(
      screen.getByRole("button", { name: /use other channel/i }),
    ).toBeInTheDocument();
  });

  it("stays out of channel fields that never opted in", () => {
    render(
      <ConfigFieldInput
        field={channelField()}
        value=""
        onChange={vi.fn()}
        channels={channels}
        guildId="guild-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Log Channel" }));
    expect(
      screen.queryByRole("button", { name: /use other channel/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ConfigFieldInput NUMBER bounds", () => {
  it("takes the slider range from the module's declared min/max", () => {
    render(
      <ConfigFieldInput
        field={field({
          key: "transfer_tax_percent",
          label: "Transfer Tax",
          type: FieldType.Number,
          step: 1,
          min: 0,
          max: 50,
        })}
        value={10}
        onChange={vi.fn()}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Transfer Tax" });
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "50");
  });

  it("bounds the plain number box too", () => {
    render(
      <ConfigFieldInput
        field={field({ key: "cap", label: "Cap", type: FieldType.Number, min: 1, max: 25 })}
        value={5}
        onChange={vi.fn()}
      />,
    );

    const box = screen.getByRole("spinbutton");
    expect(box).toHaveAttribute("min", "1");
    expect(box).toHaveAttribute("max", "25");
  });
});

describe("ConfigFieldInput template variables", () => {
  it("offers the chips the field declares, not a global list", () => {
    render(
      <ConfigFieldInput
        field={field({
          key: "panel_message",
          label: "Control Panel Message",
          type: FieldType.String,
          format: "template",
          templateVars: ["channel", "owner", "limit", "status"],
        })}
        value=""
        onChange={vi.fn()}
      />,
    );

    const chips = screen.getByRole("group", { name: "Template variables" });
    expect(within(chips).getByRole("button", { name: "Insert {owner}" })).toBeInTheDocument();
    expect(within(chips).queryByRole("button", { name: "Insert {memberCount}" })).not.toBeInTheDocument();
  });
});
