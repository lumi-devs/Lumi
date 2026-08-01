import { FT, T } from "#lib/i18n/keys/types.js";

/** `panels:` keys for the permission node browser. */
export const PermissionsPanelKeys = {
  PermsTitle: T("panels:permsTitle"),
  PermsEmpty: T("panels:permsEmpty"),
  PermsLegend: T("panels:permsLegend"),
  PermsRevoke: T("panels:permsRevoke"),
  PermsCountFooter: FT<{ count: number }>("panels:permsCountFooter"),
  PermsPageFooter: FT<{ page: number; total: number; count: number }>(
    "panels:permsPageFooter",
  ),
  PermsGrantCustom: T("panels:permsGrantCustom"),
  PermsGrantEnforced: T("panels:permsGrantEnforced"),
  PermsPickTarget: T("panels:permsPickTarget"),
  PermsPickNode: T("panels:permsPickNode"),
  PermsNoNodes: T("panels:permsNoNodes"),
  PermsGrantedTitle: T("panels:permsGrantedTitle"),
  PermsGranted: FT<{ node: string }>("panels:permsGranted"),
} as const;
