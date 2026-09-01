---
"@lumi/core": patch
---

Unified audit logging in `ConfigRepository.setModuleConfig` and `setModuleConfigsMany` by accepting optional `actorId`. When provided, changes are automatically recorded in `db.configHistory.logConfigChange`, and `ConfigUtility` now delegates audit logging directly to the repository layer.
