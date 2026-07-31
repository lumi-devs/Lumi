/**
 * Skyra-style typed i18n keys. `T` marks a plain key; `FT` carries the
 * interpolation argument shape so `t(key, args)` is compile-checked.
 */
export type TypedT<TReturn = string> = string & { __return__?: TReturn };
export type TypedFT<TArgs, TReturn = string> = string & {
  __args__?: TArgs;
  __return__?: TReturn;
};

export function T<TReturn = string>(key: string): TypedT<TReturn> {
  return key;
}

export function FT<TArgs, TReturn = string>(
  key: string,
): TypedFT<TArgs, TReturn> {
  return key;
}

export const PanelsKeys = {
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
  PanicConfirmTitle: T("panels:panicConfirmTitle"),
  PanicConfirmBody: T("panels:panicConfirmBody"),
  PanicConfirmButton: T("panels:panicConfirmButton"),
  PanicCancelledTitle: T("panels:panicCancelledTitle"),
  PanicCancelledBody: T("panels:panicCancelledBody"),
  PanicActiveTitle: T("panels:panicActiveTitle"),
  PanicActiveBody: FT<{ locked: number; skipped: string; invites: string }>(
    "panels:panicActiveBody",
  ),
  PanicInvitesPaused: T("panels:panicInvitesPaused"),
  PanicInvitesFailed: T("panels:panicInvitesFailed"),
  PanicAlreadyActiveTitle: T("panels:panicAlreadyActiveTitle"),
  PanicAlreadyActiveBody: FT<{ since: string }>(
    "panels:panicAlreadyActiveBody",
  ),
  PanicRevertButton: T("panels:panicRevertButton"),
  PanicRevertedTitle: T("panels:panicRevertedTitle"),
  PanicReverted: FT<{ restored: number }>("panels:panicReverted"),
  PanicNotActiveTitle: T("panels:panicNotActiveTitle"),
  PanicNotActive: T("panels:panicNotActive"),
  PanicDeniedTitle: T("panels:panicDeniedTitle"),
  PanicDenied: T("panels:panicDenied"),
  AddonsTitle: T("panels:addonsTitle"),
  AddonsIntro: T("panels:addonsIntro"),
  AddonsRepos: T("panels:addonsRepos"),
  AddonsInstalled: T("panels:addonsInstalled"),
  AddonsBrowseRepos: T("panels:addonsBrowseRepos"),
  AddonsBrowseInstalled: T("panels:addonsBrowseInstalled"),
  AddonsRefresh: T("panels:addonsRefresh"),
  AddonsAddRepo: T("panels:addonsAddRepo"),
  AddonsRemoveRepo: T("panels:addonsRemoveRepo"),
  AddonsUpdateAll: T("panels:addonsUpdateAll"),
  AddonsUpdateRepo: T("panels:addonsUpdateRepo"),
  AddonsFooter: T("panels:addonsFooter"),
  AddonsReposTitle: T("panels:addonsReposTitle"),
  AddonsReposEmpty: T("panels:addonsReposEmpty"),
  AddonsReposFooter: T("panels:addonsReposFooter"),
  AddonsBrowse: T("panels:addonsBrowse"),
  AddonsInstalledTitle: T("panels:addonsInstalledTitle"),
  AddonsInstalledEmpty: T("panels:addonsInstalledEmpty"),
  AddonsInstalledFooter: T("panels:addonsInstalledFooter"),
  AddonsUninstall: T("panels:addonsUninstall"),
  AddonsInstall: T("panels:addonsInstall"),
  AddonsModulesTitle: FT<{ repo: string }>("panels:addonsModulesTitle"),
  AddonsModulesEmpty: T("panels:addonsModulesEmpty"),
  AddonsModulesFooter: T("panels:addonsModulesFooter"),
  AddonsStatusInstalled: T("panels:addonsStatusInstalled"),
  AddonsStatusAvailable: T("panels:addonsStatusAvailable"),
  Back: T("panels:back"),
  BackToHub: T("panels:backToHub"),
  BackToAddons: T("panels:backToAddons"),
  BackToRepos: T("panels:backToRepos"),
  BackToModules: T("panels:backToModules"),
  BackToFeature: T("panels:backToFeature"),
  PagePrev: T("panels:pagePrev"),
  PageNext: T("panels:pageNext"),
  PageIndicator: FT<{ page: number; total: number }>("panels:pageIndicator"),
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
  VerifyTitle: T("panels:verifyTitle"),
  VerifyIntro: T("panels:verifyIntro"),
  VerifyButton: T("panels:verifyButton"),
  VerifyFooter: T("panels:verifyFooter"),
  VerifyChallengeTitle: T("panels:verifyChallengeTitle"),
  VerifyChallenge: FT<{ sequence: string; attempts: number; minutes: number }>(
    "panels:verifyChallenge",
  ),
  VerifyProgressTitle: FT<{ done: number; total: number }>(
    "panels:verifyProgressTitle",
  ),
  VerifyProgress: FT<{ sequence: string }>("panels:verifyProgress"),
  VerifyWrongTitle: T("panels:verifyWrongTitle"),
  VerifyWrong: FT<{ sequence: string; attempts: number }>("panels:verifyWrong"),
  VerifyOkTitle: T("panels:verifyOkTitle"),
  VerifyOk: T("panels:verifyOk"),
  VerifyExpiredTitle: T("panels:verifyExpiredTitle"),
  VerifyExpired: T("panels:verifyExpired"),
  VerifyFailedTitle: T("panels:verifyFailedTitle"),
  VerifyFailed: T("panels:verifyFailed"),
  VerifyDisabledTitle: T("panels:verifyDisabledTitle"),
  VerifyDisabled: T("panels:verifyDisabled"),
  VerifyPostedTitle: T("panels:verifyPostedTitle"),
  VerifyPosted: FT<{ channel: string }>("panels:verifyPosted"),
  VerifyUnconfiguredTitle: T("panels:verifyUnconfiguredTitle"),
  VerifyUnconfigured: T("panels:verifyUnconfigured"),
} as const;

export const CommonKeys = {
  /** Value: `common:default` */
  Default: "common:default",
  /** Value: `common:yes` */
  Yes: "common:yes",
  /** Value: `common:no` */
  No: "common:no",
  /** Value: `common:none` */
  None: "common:none",
  /** Value: `common:enabled` */
  Enabled: "common:enabled",
  /** Value: `common:disabled` */
  Disabled: "common:disabled",
  /** Value: `common:unknown` */
  Unknown: "common:unknown",
  /** Value: `common:loading` */
  Loading: "common:loading",
  /** Value: `common:success` */
  Success: "common:success",
  /** Value: `common:error` */
  Error: "common:error",
  /** Value: `common:warning` */
  Warning: "common:warning",
  /** Value: `common:info` */
  Info: "common:info",
  /** Value: `common:nothingHere` */
  NothingHere: "common:nothingHere",
  /** Value: `common:pagination` */
  Pagination: "common:pagination",
  /** Value: `common:permissionDenied` */
  PermissionDenied: "common:permissionDenied",
  /** Value: `common:guildOnly` */
  GuildOnly: "common:guildOnly",
  /** Value: `common:unexpectedError` */
  UnexpectedError: "common:unexpectedError",
} as const;

export const PreconditionsKeys = {
  /** Value: `preconditions:moderator` */
  Moderator: "preconditions:moderator",
  /** Value: `preconditions:administrator` */
  Administrator: "preconditions:administrator",
  /** Value: `preconditions:guildOwner` */
  GuildOwner: "preconditions:guildOwner",
  /** Value: `preconditions:botOwner` */
  BotOwner: "preconditions:botOwner",
  /** Value: `preconditions:moduleDisabled` */
  ModuleDisabled: "preconditions:moduleDisabled",
  /** Value: `preconditions:permissionDenied` */
  PermissionDenied: "preconditions:permissionDenied",
} as const;

export const CommandsKeys = {
  /** Value: `commands:languageName` */
  LanguageName: "commands:languageName",
  /** Value: `commands:languageDescription` */
  LanguageDescription: "commands:languageDescription",
  /** Value: `commands:languageViewName` */
  LanguageViewName: "commands:languageViewName",
  /** Value: `commands:languageViewDescription` */
  LanguageViewDescription: "commands:languageViewDescription",
  /** Value: `commands:languageSetName` */
  LanguageSetName: "commands:languageSetName",
  /** Value: `commands:languageSetDescription` */
  LanguageSetDescription: "commands:languageSetDescription",
  /** Value: `commands:languageResetName` */
  LanguageResetName: "commands:languageResetName",
  /** Value: `commands:languageResetDescription` */
  LanguageResetDescription: "commands:languageResetDescription",
  /** Value: `commands:languageOptionName` */
  LanguageOptionName: "commands:languageOptionName",
  /** Value: `commands:languageOptionDescription` */
  LanguageOptionDescription: "commands:languageOptionDescription",
  /** Value: `commands:languageCurrentTitle` */
  LanguageCurrentTitle: "commands:languageCurrentTitle",
  /** Value: `commands:languageCurrent` */
  LanguageCurrent: "commands:languageCurrent",
  /** Value: `commands:languageUpdatedTitle` */
  LanguageUpdatedTitle: "commands:languageUpdatedTitle",
  /** Value: `commands:languageUpdated` */
  LanguageUpdated: "commands:languageUpdated",
  /** Value: `commands:languageResetTitle` */
  LanguageResetTitle: "commands:languageResetTitle",
  /** Value: `commands:languageReset` */
  LanguageReset: "commands:languageReset",
  /** Value: `commands:languageUnsupportedTitle` */
  LanguageUnsupportedTitle: "commands:languageUnsupportedTitle",
  /** Value: `commands:languageUnsupported` */
  LanguageUnsupported: "commands:languageUnsupported",
  /** Value: `commands:languageAlreadySet` */
  LanguageAlreadySet: "commands:languageAlreadySet",
  /** Value: `commands:prefixName` */
  PrefixName: "commands:prefixName",
  /** Value: `commands:prefixDescription` */
  PrefixDescription: "commands:prefixDescription",
  /** Value: `commands:prefixViewName` */
  PrefixViewName: "commands:prefixViewName",
  /** Value: `commands:prefixViewDescription` */
  PrefixViewDescription: "commands:prefixViewDescription",
  /** Value: `commands:prefixSetName` */
  PrefixSetName: "commands:prefixSetName",
  /** Value: `commands:prefixSetDescription` */
  PrefixSetDescription: "commands:prefixSetDescription",
  /** Value: `commands:prefixResetName` */
  PrefixResetName: "commands:prefixResetName",
  /** Value: `commands:prefixResetDescription` */
  PrefixResetDescription: "commands:prefixResetDescription",
  /** Value: `commands:prefixOptionName` */
  PrefixOptionName: "commands:prefixOptionName",
  /** Value: `commands:prefixOptionDescription` */
  PrefixOptionDescription: "commands:prefixOptionDescription",
  /** Value: `commands:prefixCurrentTitle` */
  PrefixCurrentTitle: "commands:prefixCurrentTitle",
  /** Value: `commands:prefixCurrent` */
  PrefixCurrent: "commands:prefixCurrent",
  /** Value: `commands:prefixUpdatedTitle` */
  PrefixUpdatedTitle: "commands:prefixUpdatedTitle",
  /** Value: `commands:prefixUpdated` */
  PrefixUpdated: "commands:prefixUpdated",
  /** Value: `commands:prefixResetTitle` */
  PrefixResetTitle: "commands:prefixResetTitle",
  /** Value: `commands:prefixReset` */
  PrefixReset: "commands:prefixReset",
  /** Value: `commands:prefixTooLongTitle` */
  PrefixTooLongTitle: "commands:prefixTooLongTitle",
  /** Value: `commands:prefixTooLong` */
  PrefixTooLong: "commands:prefixTooLong",
  /** Value: `commands:prefixMissingTitle` */
  PrefixMissingTitle: "commands:prefixMissingTitle",
  /** Value: `commands:prefixMissing` */
  PrefixMissing: "commands:prefixMissing",
  /** Value: `commands:modReasonName` */
  ModReasonName: "commands:modReasonName",
  /** Value: `commands:modReasonDescription` */
  ModReasonDescription: "commands:modReasonDescription",
  /** Value: `commands:modNoReason` */
  ModNoReason: "commands:modNoReason",
  /** Value: `commands:modMemberNotFoundTitle` */
  ModMemberNotFoundTitle: "commands:modMemberNotFoundTitle",
  /** Value: `commands:modMemberNotFound` */
  ModMemberNotFound: "commands:modMemberNotFound",
  /** Value: `commands:modActionFailedTitle` */
  ModActionFailedTitle: "commands:modActionFailedTitle",
  /** Value: `commands:modActionFailed` */
  ModActionFailed: "commands:modActionFailed",
  /** Value: `commands:kickName` */
  KickName: "commands:kickName",
  /** Value: `commands:kickDescription` */
  KickDescription: "commands:kickDescription",
  /** Value: `commands:kickMemberName` */
  KickMemberName: "commands:kickMemberName",
  /** Value: `commands:kickMemberDescription` */
  KickMemberDescription: "commands:kickMemberDescription",
  /** Value: `commands:kickSuccessTitle` */
  KickSuccessTitle: "commands:kickSuccessTitle",
  /** Value: `commands:kickSuccess` */
  KickSuccess: "commands:kickSuccess",
  /** Value: `commands:warnName` */
  WarnName: "commands:warnName",
  /** Value: `commands:warnDescription` */
  WarnDescription: "commands:warnDescription",
  /** Value: `commands:warnMemberName` */
  WarnMemberName: "commands:warnMemberName",
  /** Value: `commands:warnMemberDescription` */
  WarnMemberDescription: "commands:warnMemberDescription",
  /** Value: `commands:warnSuccessTitle` */
  WarnSuccessTitle: "commands:warnSuccessTitle",
  /** Value: `commands:warnSuccess` */
  WarnSuccess: "commands:warnSuccess",
  /** Value: `commands:banName` */
  BanName: "commands:banName",
  /** Value: `commands:banDescription` */
  BanDescription: "commands:banDescription",
  /** Value: `commands:banAddName` */
  BanAddName: "commands:banAddName",
  /** Value: `commands:banAddDescription` */
  BanAddDescription: "commands:banAddDescription",
  /** Value: `commands:banUserName` */
  BanUserName: "commands:banUserName",
  /** Value: `commands:banUserDescription` */
  BanUserDescription: "commands:banUserDescription",
  /** Value: `commands:banDeleteDaysName` */
  BanDeleteDaysName: "commands:banDeleteDaysName",
  /** Value: `commands:banDeleteDaysDescription` */
  BanDeleteDaysDescription: "commands:banDeleteDaysDescription",
  /** Value: `commands:banRemoveName` */
  BanRemoveName: "commands:banRemoveName",
  /** Value: `commands:banRemoveDescription` */
  BanRemoveDescription: "commands:banRemoveDescription",
  /** Value: `commands:banUserIdName` */
  BanUserIdName: "commands:banUserIdName",
  /** Value: `commands:banUserIdDescription` */
  BanUserIdDescription: "commands:banUserIdDescription",
  /** Value: `commands:banSuccessTitle` */
  BanSuccessTitle: "commands:banSuccessTitle",
  /** Value: `commands:banSuccess` */
  BanSuccess: "commands:banSuccess",
  /** Value: `commands:banInvalidIdTitle` */
  BanInvalidIdTitle: "commands:banInvalidIdTitle",
  /** Value: `commands:banInvalidId` */
  BanInvalidId: "commands:banInvalidId",
  /** Value: `commands:banRemoveFailed` */
  BanRemoveFailed: "commands:banRemoveFailed",
  /** Value: `commands:banRemoveSuccessTitle` */
  BanRemoveSuccessTitle: "commands:banRemoveSuccessTitle",
  /** Value: `commands:banRemoveSuccess` */
  BanRemoveSuccess: "commands:banRemoveSuccess",
  /** Value: `commands:timeoutName` */
  TimeoutName: "commands:timeoutName",
  /** Value: `commands:timeoutDescription` */
  TimeoutDescription: "commands:timeoutDescription",
  /** Value: `commands:timeoutAddName` */
  TimeoutAddName: "commands:timeoutAddName",
  /** Value: `commands:timeoutAddDescription` */
  TimeoutAddDescription: "commands:timeoutAddDescription",
  /** Value: `commands:timeoutMemberName` */
  TimeoutMemberName: "commands:timeoutMemberName",
  /** Value: `commands:timeoutMemberDescription` */
  TimeoutMemberDescription: "commands:timeoutMemberDescription",
  /** Value: `commands:timeoutDurationName` */
  TimeoutDurationName: "commands:timeoutDurationName",
  /** Value: `commands:timeoutDurationDescription` */
  TimeoutDurationDescription: "commands:timeoutDurationDescription",
  /** Value: `commands:timeoutRemoveName` */
  TimeoutRemoveName: "commands:timeoutRemoveName",
  /** Value: `commands:timeoutRemoveDescription` */
  TimeoutRemoveDescription: "commands:timeoutRemoveDescription",
  /** Value: `commands:timeoutInvalidDurationTitle` */
  TimeoutInvalidDurationTitle: "commands:timeoutInvalidDurationTitle",
  /** Value: `commands:timeoutInvalidDuration` */
  TimeoutInvalidDuration: "commands:timeoutInvalidDuration",
  /** Value: `commands:timeoutTooLongTitle` */
  TimeoutTooLongTitle: "commands:timeoutTooLongTitle",
  /** Value: `commands:timeoutTooLong` */
  TimeoutTooLong: "commands:timeoutTooLong",
  /** Value: `commands:timeoutSuccessTitle` */
  TimeoutSuccessTitle: "commands:timeoutSuccessTitle",
  /** Value: `commands:timeoutSuccess` */
  TimeoutSuccess: "commands:timeoutSuccess",
  /** Value: `commands:timeoutRemovedTitle` */
  TimeoutRemovedTitle: "commands:timeoutRemovedTitle",
  /** Value: `commands:timeoutRemoved` */
  TimeoutRemoved: "commands:timeoutRemoved",
  /** Value: `commands:casesName` */
  CasesName: "commands:casesName",
  /** Value: `commands:casesDescription` */
  CasesDescription: "commands:casesDescription",
  /** Value: `commands:casesViewName` */
  CasesViewName: "commands:casesViewName",
  /** Value: `commands:casesViewDescription` */
  CasesViewDescription: "commands:casesViewDescription",
  /** Value: `commands:casesMemberName` */
  CasesMemberName: "commands:casesMemberName",
  /** Value: `commands:casesMemberDescription` */
  CasesMemberDescription: "commands:casesMemberDescription",
  /** Value: `commands:casesNumberName` */
  CasesNumberName: "commands:casesNumberName",
  /** Value: `commands:casesNumberDescription` */
  CasesNumberDescription: "commands:casesNumberDescription",
  /** Value: `commands:casesActionName` */
  CasesActionName: "commands:casesActionName",
  /** Value: `commands:casesActionDescription` */
  CasesActionDescription: "commands:casesActionDescription",
  /** Value: `commands:casesModifyName` */
  CasesModifyName: "commands:casesModifyName",
  /** Value: `commands:casesModifyDescription` */
  CasesModifyDescription: "commands:casesModifyDescription",
  /** Value: `commands:casesNewReasonName` */
  CasesNewReasonName: "commands:casesNewReasonName",
  /** Value: `commands:casesNewReasonDescription` */
  CasesNewReasonDescription: "commands:casesNewReasonDescription",
  /** Value: `commands:casesDeleteName` */
  CasesDeleteName: "commands:casesDeleteName",
  /** Value: `commands:casesDeleteDescription` */
  CasesDeleteDescription: "commands:casesDeleteDescription",
  /** Value: `commands:casesUsageTitle` */
  CasesUsageTitle: "commands:casesUsageTitle",
  /** Value: `commands:casesModifyUsage` */
  CasesModifyUsage: "commands:casesModifyUsage",
  /** Value: `commands:casesViewUsage` */
  CasesViewUsage: "commands:casesViewUsage",
  /** Value: `commands:casesNotFoundTitle` */
  CasesNotFoundTitle: "commands:casesNotFoundTitle",
  /** Value: `commands:casesNotFound` */
  CasesNotFound: "commands:casesNotFound",
  /** Value: `commands:casesUpdatedTitle` */
  CasesUpdatedTitle: "commands:casesUpdatedTitle",
  /** Value: `commands:casesUpdated` */
  CasesUpdated: "commands:casesUpdated",
  /** Value: `commands:casesDeletedTitle` */
  CasesDeletedTitle: "commands:casesDeletedTitle",
  /** Value: `commands:casesDeleted` */
  CasesDeleted: "commands:casesDeleted",
  /** Value: `commands:casesNoneTitle` */
  CasesNoneTitle: "commands:casesNoneTitle",
  /** Value: `commands:casesNone` */
  CasesNone: "commands:casesNone",
  /** Value: `commands:quarantineName` */
  QuarantineName: "commands:quarantineName",
  /** Value: `commands:quarantineDescription` */
  QuarantineDescription: "commands:quarantineDescription",
  /** Value: `commands:quarantineAddName` */
  QuarantineAddName: "commands:quarantineAddName",
  /** Value: `commands:quarantineAddDescription` */
  QuarantineAddDescription: "commands:quarantineAddDescription",
  /** Value: `commands:quarantineMemberName` */
  QuarantineMemberName: "commands:quarantineMemberName",
  /** Value: `commands:quarantineMemberDescription` */
  QuarantineMemberDescription: "commands:quarantineMemberDescription",
  /** Value: `commands:quarantineRemoveName` */
  QuarantineRemoveName: "commands:quarantineRemoveName",
  /** Value: `commands:quarantineRemoveDescription` */
  QuarantineRemoveDescription: "commands:quarantineRemoveDescription",
  /** Value: `commands:quarantineUnconfiguredTitle` */
  QuarantineUnconfiguredTitle: "commands:quarantineUnconfiguredTitle",
  /** Value: `commands:quarantineUnconfigured` */
  QuarantineUnconfigured: "commands:quarantineUnconfigured",
  /** Value: `commands:quarantineAlreadyTitle` */
  QuarantineAlreadyTitle: "commands:quarantineAlreadyTitle",
  /** Value: `commands:quarantineAlready` */
  QuarantineAlready: "commands:quarantineAlready",
  /** Value: `commands:quarantineNotTitle` */
  QuarantineNotTitle: "commands:quarantineNotTitle",
  /** Value: `commands:quarantineNot` */
  QuarantineNot: "commands:quarantineNot",
  /** Value: `commands:quarantineSuccessTitle` */
  QuarantineSuccessTitle: "commands:quarantineSuccessTitle",
  /** Value: `commands:quarantineSuccess` */
  QuarantineSuccess: "commands:quarantineSuccess",
  /** Value: `commands:quarantineReleasedTitle` */
  QuarantineReleasedTitle: "commands:quarantineReleasedTitle",
  /** Value: `commands:quarantineReleased` */
  QuarantineReleased: "commands:quarantineReleased",
  /** Value: `commands:sanitizeName` */
  SanitizeName: "commands:sanitizeName",
  /** Value: `commands:sanitizeDescription` */
  SanitizeDescription: "commands:sanitizeDescription",
  /** Value: `commands:sanitizeMemberName` */
  SanitizeMemberName: "commands:sanitizeMemberName",
  /** Value: `commands:sanitizeMemberDescription` */
  SanitizeMemberDescription: "commands:sanitizeMemberDescription",
  /** Value: `commands:sanitizeNothingTitle` */
  SanitizeNothingTitle: "commands:sanitizeNothingTitle",
  /** Value: `commands:sanitizeNothing` */
  SanitizeNothing: "commands:sanitizeNothing",
  /** Value: `commands:sanitizeSuccessTitle` */
  SanitizeSuccessTitle: "commands:sanitizeSuccessTitle",
  /** Value: `commands:sanitizeSuccess` */
  SanitizeSuccess: "commands:sanitizeSuccess",
  /** Value: `commands:afkName` */
  AfkName: "commands:afkName",
  /** Value: `commands:afkDescription` */
  AfkDescription: "commands:afkDescription",
  /** Value: `commands:afkReasonName` */
  AfkReasonName: "commands:afkReasonName",
  /** Value: `commands:afkReasonDescription` */
  AfkReasonDescription: "commands:afkReasonDescription",
  /** Value: `commands:afkAlreadyTitle` */
  AfkAlreadyTitle: "commands:afkAlreadyTitle",
  /** Value: `commands:afkAlready` */
  AfkAlready: "commands:afkAlready",
  /** Value: `commands:afkUpdatedTitle` */
  AfkUpdatedTitle: "commands:afkUpdatedTitle",
  /** Value: `commands:afkUpdated` */
  AfkUpdated: "commands:afkUpdated",
  /** Value: `commands:afkSetTitle` */
  AfkSetTitle: "commands:afkSetTitle",
  /** Value: `commands:afkSet` */
  AfkSet: "commands:afkSet",
  /** Value: `commands:nickUsageTitle` */
  NickUsageTitle: "commands:nickUsageTitle",
  /** Value: `commands:nickUsage` */
  NickUsage: "commands:nickUsage",
  /** Value: `commands:nickInvalidTargetTitle` */
  NickInvalidTargetTitle: "commands:nickInvalidTargetTitle",
  /** Value: `commands:nickInvalidTarget` */
  NickInvalidTarget: "commands:nickInvalidTarget",
  /** Value: `commands:nickPermissionDeniedTitle` */
  NickPermissionDeniedTitle: "commands:nickPermissionDeniedTitle",
  /** Value: `commands:nickRoleHierarchy` */
  NickRoleHierarchy: "commands:nickRoleHierarchy",
  /** Value: `commands:nickSuccessTitle` */
  NickSuccessTitle: "commands:nickSuccessTitle",
  /** Value: `commands:nickResetTitle` */
  NickResetTitle: "commands:nickResetTitle",
  /** Value: `commands:nickChangedDesc` */
  NickChangedDesc: "commands:nickChangedDesc",
  /** Value: `commands:nickResetDesc` */
  NickResetDesc: "commands:nickResetDesc",
  /** Value: `commands:nickFailed` */
  NickFailed: "commands:nickFailed",
  /** Value: `commands:purgeInvalidAmountTitle` */
  PurgeInvalidAmountTitle: "commands:purgeInvalidAmountTitle",
  /** Value: `commands:purgeInvalidAmount` */
  PurgeInvalidAmount: "commands:purgeInvalidAmount",
  /** Value: `commands:purgeInitiatingTitle` */
  PurgeInitiatingTitle: "commands:purgeInitiatingTitle",
  /** Value: `commands:purgeInitiating` */
  PurgeInitiating: "commands:purgeInitiating",
  /** Value: `commands:purgeProceeding` */
  PurgeProceeding: "commands:purgeProceeding",
  /** Value: `commands:purgeCompleteTitle` */
  PurgeCompleteTitle: "commands:purgeCompleteTitle",
  /** Value: `commands:purgeComplete` */
  PurgeComplete: "commands:purgeComplete",
  /** Value: `commands:purgeConfirmTitle` */
  PurgeConfirmTitle: "commands:purgeConfirmTitle",
  /** Value: `commands:purgeConfirmText` */
  PurgeConfirmText: "commands:purgeConfirmText",
  /** Value: `commands:purgeConfirmBtn` */
  PurgeConfirmBtn: "commands:purgeConfirmBtn",
  /** Value: `commands:purgeCancelBtn` */
  PurgeCancelBtn: "commands:purgeCancelBtn",
  /** Value: `commands:purgeCancelledTitle` */
  PurgeCancelledTitle: "commands:purgeCancelledTitle",
  /** Value: `commands:purgeCancelledText` */
  PurgeCancelledText: "commands:purgeCancelledText",
  /** Value: `commands:purgeTimeoutText` */
  PurgeTimeoutText: "commands:purgeTimeoutText",
  /** Value: `commands:mediaCooldownTitle` */
  MediaCooldownTitle: "commands:mediaCooldownTitle",
  /** Value: `commands:mediaCooldown` */
  MediaCooldown: "commands:mediaCooldown",
  /** Value: `commands:mediaLinkBtn` */
  MediaLinkBtn: "commands:mediaLinkBtn",
  /** Value: `commands:mediaViewBtn` */
  MediaViewBtn: "commands:mediaViewBtn",
  /** Value: `commands:mediaCardTitle` */
  MediaCardTitle: "commands:mediaCardTitle",
  /** Value: `commands:moduleNotFoundTitle` */
  ModuleNotFoundTitle: "commands:moduleNotFoundTitle",
  /** Value: `commands:moduleNotFound` */
  ModuleNotFound: "commands:moduleNotFound",
  /** Value: `commands:moduleForbiddenTitle` */
  ModuleForbiddenTitle: "commands:moduleForbiddenTitle",
  /** Value: `commands:moduleCannotDisableCore` */
  ModuleCannotDisableCore: "commands:moduleCannotDisableCore",
  /** Value: `commands:moduleCannotDisableEssential` */
  ModuleCannotDisableEssential: "commands:moduleCannotDisableEssential",
  /** Value: `commands:moduleEnabledTitle` */
  ModuleEnabledTitle: "commands:moduleEnabledTitle",
  /** Value: `commands:moduleDisabledTitle` */
  ModuleDisabledTitle: "commands:moduleDisabledTitle",
  /** Value: `commands:moduleEnabledSuccess` */
  ModuleEnabledSuccess: "commands:moduleEnabledSuccess",
  /** Value: `commands:moduleDisabledSuccess` */
  ModuleDisabledSuccess: "commands:moduleDisabledSuccess",
  /** Value: `commands:helpTitle` */
  HelpTitle: "commands:helpTitle",
  /** Value: `commands:helpModuleHeader` */
  HelpModuleHeader: "commands:helpModuleHeader",
  /** Value: `commands:helpNoDescription` */
  HelpNoDescription: "commands:helpNoDescription",
  /** Value: `commands:helpNoCommands` */
  HelpNoCommands: "commands:helpNoCommands",
  /** Value: `commands:helpFooter` */
  HelpFooter: "commands:helpFooter",
  /** Value: `commands:aboutTitle` */
  AboutTitle: "commands:aboutTitle",
  /** Value: `commands:aboutTagline` */
  AboutTagline: "commands:aboutTagline",
  /** Value: `commands:aboutInstanceStats` */
  AboutInstanceStats: "commands:aboutInstanceStats",
  /** Value: `commands:aboutCoreArch` */
  AboutCoreArch: "commands:aboutCoreArch",
  /** Value: `commands:aboutLoadedModules` */
  AboutLoadedModules: "commands:aboutLoadedModules",
} as const;

export const LanguageKeys = {
  Common: CommonKeys,
  Preconditions: PreconditionsKeys,
  Commands: CommandsKeys,
  Panels: PanelsKeys,
} as const;
