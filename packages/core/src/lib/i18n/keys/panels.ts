import { AddonsPanelKeys } from "#lib/i18n/keys/panels/addons.js";
import { HubPanelKeys } from "#lib/i18n/keys/panels/hub.js";
import { ModulesPanelKeys } from "#lib/i18n/keys/panels/modules.js";
import { NavigationPanelKeys } from "#lib/i18n/keys/panels/navigation.js";
import { PanicPanelKeys } from "#lib/i18n/keys/panels/panic.js";
import { PermissionsPanelKeys } from "#lib/i18n/keys/panels/permissions.js";
import { SettingsPanelKeys } from "#lib/i18n/keys/panels/settings.js";
import { VerifyPanelKeys } from "#lib/i18n/keys/panels/verify.js";

/** Every `panels:` key, flattened per panel area. */
export const PanelsKeys = {
  ...HubPanelKeys,
  ...SettingsPanelKeys,
  ...PermissionsPanelKeys,
  ...ModulesPanelKeys,
  ...AddonsPanelKeys,
  ...NavigationPanelKeys,
  ...PanicPanelKeys,
  ...VerifyPanelKeys,
} as const;
