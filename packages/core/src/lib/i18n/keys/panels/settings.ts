import { T } from "#lib/i18n/keys/types.js";

/** `panels:` keys for the guild settings tab. */
export const SettingsPanelKeys = {
  SettingsTitle: T("panels:settingsTitle"),
  SettingsLanguage: T("panels:settingsLanguage"),
  SettingsPrefix: T("panels:settingsPrefix"),
  SettingsPrefixDefault: T("panels:settingsPrefixDefault"),
  SettingsChangeLanguage: T("panels:settingsChangeLanguage"),
  SettingsEdit: T("panels:settingsEdit"),
  SettingsReset: T("panels:settingsReset"),
  SettingsFooter: T("panels:settingsFooter"),
  SettingsUpdateAddons: T("panels:settingsUpdateAddons"),
  SettingsCheckCore: T("panels:settingsCheckCore"),
  SettingsUpdateCore: T("panels:settingsUpdateCore"),
} as const;
