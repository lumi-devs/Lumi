import { FT, T } from "#lib/i18n/keys/types.js";

/** `panels:` keys for the security module's verification flow. */
export const VerifyPanelKeys = {
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
