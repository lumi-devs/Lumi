import { FT, T } from "#lib/i18n/keys/types.js";

/** `panels:` keys for the security module's panic mode flow. */
export const PanicPanelKeys = {
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
} as const;
