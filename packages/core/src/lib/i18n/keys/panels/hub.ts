import { FT, T } from "#lib/i18n/keys/types.js";

/** `panels:` keys for the hub landing panel and its tab strip. */
export const HubPanelKeys = {
  HubTitle: T("panels:hubTitle"),
  HubIntro: T("panels:hubIntro"),
  HubGlanceModules: FT<{ enabled: number; total: number }>(
    "panels:hubGlanceModules",
  ),
  HubGlanceLocale: FT<{ locale: string; prefix: string }>(
    "panels:hubGlanceLocale",
  ),
  HubFooter: T("panels:hubFooter"),
  TabHome: T("panels:tabHome"),
  TabModules: T("panels:tabModules"),
  TabPermissions: T("panels:tabPermissions"),
  TabSettings: T("panels:tabSettings"),
  TabAddons: T("panels:tabAddons"),
  TabHintModules: T("panels:tabHintModules"),
  TabHintPermissions: T("panels:tabHintPermissions"),
  TabHintSettings: T("panels:tabHintSettings"),
  TabHintAddons: T("panels:tabHintAddons"),
} as const;
