---
"@lumi/dashboard": patch
---

`GeneralSettingsForm` now stays in sync across browser tabs: a successful save broadcasts the new settings to other open tabs for the same guild (via `BroadcastChannel`, with a gossip handshake so a tab opened after the save still catches up), updating untouched fields while preserving and flagging any field the user has locally edited but not yet saved.
