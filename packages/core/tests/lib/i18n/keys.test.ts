import { describe, it, expect } from "vitest";
import { AfkCommandsKeys } from "#lib/i18n/keys/commands/afk.js";
import { CoreCommandsKeys } from "#lib/i18n/keys/commands/core.js";
import { ModerationCommandsKeys } from "#lib/i18n/keys/commands/mod.js";
import { UtilityCommandsKeys } from "#lib/i18n/keys/commands/utility.js";
import { CommandsKeys } from "#lib/i18n/keys/commands.js";
import { AddonsPanelKeys } from "#lib/i18n/keys/panels/addons.js";
import { HubPanelKeys } from "#lib/i18n/keys/panels/hub.js";
import { ModulesPanelKeys } from "#lib/i18n/keys/panels/modules.js";
import { NavigationPanelKeys } from "#lib/i18n/keys/panels/navigation.js";
import { PanicPanelKeys } from "#lib/i18n/keys/panels/panic.js";
import { PermissionsPanelKeys } from "#lib/i18n/keys/panels/permissions.js";
import { SettingsPanelKeys } from "#lib/i18n/keys/panels/settings.js";
import { VerifyPanelKeys } from "#lib/i18n/keys/panels/verify.js";
import { PanelsKeys } from "#lib/i18n/keys/panels.js";

describe("i18n key tables", () => {
  it("CommandsKeys has no key dropped by a spread collision", () => {
    const domainTables = [
      CoreCommandsKeys,
      ModerationCommandsKeys,
      AfkCommandsKeys,
      UtilityCommandsKeys,
    ];
    const expectedCount = domainTables.reduce(
      (sum, table) => sum + Object.keys(table).length,
      0,
    );
    expect(Object.keys(CommandsKeys).length).toBe(expectedCount);
  });

  it("PanelsKeys has no key dropped by a spread collision", () => {
    const domainTables = [
      HubPanelKeys,
      SettingsPanelKeys,
      PermissionsPanelKeys,
      ModulesPanelKeys,
      AddonsPanelKeys,
      NavigationPanelKeys,
      PanicPanelKeys,
      VerifyPanelKeys,
    ];
    const expectedCount = domainTables.reduce(
      (sum, table) => sum + Object.keys(table).length,
      0,
    );
    expect(Object.keys(PanelsKeys).length).toBe(expectedCount);
  });
});
