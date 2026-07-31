---
"@lumi/core": minor
---

Reimagined control panels on the Components V2 kit: `/lumi panel` gains a persistent five-tab bar, guild-icon thumbnail header, section rows with inline action buttons (permit revoke, addon browse/install/uninstall, prefix edit), and paginated permission lists. The module config panel now renders every field as a section row with an inline toggle/edit button and per-field edit subpanels, structurally eliminating the five-action-row overflow that silently dropped select menus. Adds a typed i18n key system (Skyra-style `T`/`FT` keys with compile-checked interpolation args), a new `panels` translation namespace localizing the entire admin surface, tempvc subview localization, and a 5s cache for ping panel data.
