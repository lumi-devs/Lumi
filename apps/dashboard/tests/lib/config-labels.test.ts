import { describe, it, expect } from "vitest";
import { FieldType } from "@lumi/contracts";
import {
  buildModuleLabelIndex,
  fieldLabel,
  fieldType,
  moduleLabel,
  resolveConfigValue,
} from "#/lib/config-labels";
import type { DashboardModuleView } from "#/lib/dashboard-data";

function securityModule(): DashboardModuleView {
  return {
    name: "security",
    displayName: "Security",
    emoji: "🛡️",
    description: "",
    version: "1.0.0",
    conflicts: [],
    dependencies: [],
    enabled: true,
    isAddon: false,
    config: {},
    configFields: [
      {
        key: "joingate_enabled",
        label: "Join Gate",
        type: FieldType.BOOLEAN,
        description: "",
      },
    ],
  };
}

function modModule(): DashboardModuleView {
  return {
    name: "mod",
    displayName: "Moderation",
    emoji: "🔨",
    description: "",
    version: "1.0.0",
    conflicts: [],
    dependencies: [],
    enabled: true,
    isAddon: false,
    config: {},
    configFields: [
      {
        key: "log_channel_id",
        label: "Log Channel",
        type: FieldType.CHANNEL,
        description: "",
      },
    ],
  };
}

describe("buildModuleLabelIndex / moduleLabel / fieldLabel", () => {
  it("resolves the user's reported raw strings to friendly labels", () => {
    const labels = buildModuleLabelIndex([securityModule(), modModule()]);

    expect(moduleLabel(labels, "security")).toBe("Security");
    expect(fieldLabel(labels, "security", "joingate_enabled")).toBe(
      "Join Gate",
    );
    expect(moduleLabel(labels, "mod")).toBe("Moderation");
    expect(fieldLabel(labels, "mod", "log_channel_id")).toBe("Log Channel");
  });

  it("falls back to the raw name when a module or key isn't in the manifest", () => {
    const labels = buildModuleLabelIndex([]);
    expect(moduleLabel(labels, "unknown")).toBe("unknown");
    expect(fieldLabel(labels, "unknown", "some_key")).toBe("some_key");
  });
});

describe("resolveConfigValue", () => {
  it("turns a channel snowflake into #channel-name", () => {
    const labels = buildModuleLabelIndex([modModule()]);
    const channels = [{ id: "1537376009148571650", name: "mod-log", type: 0 }];
    const value = resolveConfigValue(
      fieldType(labels, "mod", "log_channel_id"),
      "1537376009148571650",
      [],
      channels,
    );
    expect(value).toBe("#mod-log");
  });

  it("turns a role snowflake into @role-name", () => {
    const roleField = {
      key: "muted_role_id",
      label: "Muted Role",
      type: FieldType.ROLE,
      description: "",
    };
    const labels = buildModuleLabelIndex([
      {
        ...modModule(),
        configFields: [roleField],
      },
    ]);
    const roles = [
      {
        id: "998877665544332211",
        name: "Muted",
        color: 0,
        position: 0,
        permissions: "0",
        isBotRole: false,
      },
    ];
    const value = resolveConfigValue(
      fieldType(labels, "mod", "muted_role_id"),
      "998877665544332211",
      roles,
      [],
    );
    expect(value).toBe("@Muted");
  });

  it("turns a BOOLEAN value into On/Off", () => {
    const labels = buildModuleLabelIndex([securityModule()]);
    expect(
      resolveConfigValue(
        fieldType(labels, "security", "joingate_enabled"),
        true,
        [],
        [],
      ),
    ).toBe("On");
    expect(
      resolveConfigValue(
        fieldType(labels, "security", "joingate_enabled"),
        false,
        [],
        [],
      ),
    ).toBe("Off");
  });

  it("passes non-channel/role values through unchanged", () => {
    expect(resolveConfigValue(FieldType.STRING, "hello", [], [])).toBe(
      "hello",
    );
    expect(resolveConfigValue(undefined, 42, [], [])).toBe("42");
  });

  it("leaves a channel/role id as-is when it can't be resolved", () => {
    expect(
      resolveConfigValue(FieldType.CHANNEL, "1537376009148571650", [], []),
    ).toBe("1537376009148571650");
  });
});
