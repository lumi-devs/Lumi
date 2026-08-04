---
"@lumi/core": patch
---

Fix a crash in the scheduled mod-lift handler when a case's action is `voice_mute` — it now routes to `VoiceMuteAction.undoRaw` instead of falling through unhandled.
