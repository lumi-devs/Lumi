---
"@lumi/core": patch
---

Removes dead code left behind by the panel-kit rebuild: unused `*Row` select-menu
wrapper functions in `#utilities/panels.js` (`createUserSelectMenuRow`,
`createRoleSelectMenuRow`, `createChannelSelectMenuRow`,
`createMentionableSelectMenuRow`, `createStringSelectMenuRow`,
`createMultiSelectMenuRow`), and unused layout helpers (`metric`,
`metricsBlock`, `statBlock`, `createSection`, `smallSeparator`, `SB`) along
with their now-unreferenced `Field`/`StatItem` types. No behavior changes -
none of these had any callers.
