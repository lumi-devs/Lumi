import { FT, T } from "#lib/i18n/keys/types.js";

/** `panels:` keys for the module list, module detail view and its editors. */
export const ModulesPanelKeys = {
  ModulesTitle: T("panels:modulesTitle"),
  ModulesSubtitle: T("panels:modulesSubtitle"),
  ModulesEmpty: T("panels:modulesEmpty"),
  ModulesOpen: T("panels:modulesOpen"),
  ModulesFooter: T("panels:modulesFooter"),
  ModulesPageFooter: FT<{ page: number; total: number }>(
    "panels:modulesPageFooter",
  ),
  DetailStatus: T("panels:detailStatus"),
  DetailEnabled: T("panels:detailEnabled"),
  DetailDisabled: T("panels:detailDisabled"),
  DetailRequired: T("panels:detailRequired"),
  DetailNotSet: T("panels:detailNotSet"),
  DetailEnable: T("panels:detailEnable"),
  DetailDisable: T("panels:detailDisable"),
  DetailReset: T("panels:detailReset"),
  DetailHistory: T("panels:detailHistory"),
  DetailOverrides: T("panels:detailOverrides"),
  DetailEdit: T("panels:detailEdit"),
  DetailFieldsFooter: FT<{ from: number; to: number; count: number }>(
    "panels:detailFieldsFooter",
  ),
  DetailSection: FT<{ name: string; index: number; total: number }>(
    "panels:detailSection",
  ),
  DetailJump: T("panels:detailJump"),
  FieldEditTitle: FT<{ module: string; field: string }>(
    "panels:fieldEditTitle",
  ),
  FieldEditCurrent: T("panels:fieldEditCurrent"),
  FieldEditHint: T("panels:fieldEditHint"),
  FieldEditEnterValue: T("panels:fieldEditEnterValue"),
  HistoryTitle: FT<{ module: string }>("panels:historyTitle"),
  HistorySubtitle: T("panels:historySubtitle"),
  HistoryEmpty: T("panels:historyEmpty"),
  HistoryRollback: T("panels:historyRollback"),
  OverridesTitle: FT<{ module: string }>("panels:overridesTitle"),
  OverridesSubtitle: T("panels:overridesSubtitle"),
  OverridesEmpty: T("panels:overridesEmpty"),
  OverridesAdd: T("panels:overridesAdd"),
  OverridesRemove: T("panels:overridesRemove"),
  OverridesHint: T("panels:overridesHint"),
} as const;
