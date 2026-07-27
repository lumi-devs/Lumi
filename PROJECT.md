# Project: SaaS Interactive Panels Rewrite

## Architecture
- **Workspace**: Monorepo (`packages/core/src/modules/`, `packages/core/src/lib/utilities/`)
- **Card System & UI**: `packages/core/src/lib/utilities/cards.ts` and panel builder helpers.
- **Modules in scope**: Config Panel, Module Hub Panel, TempVC Panel, interaction handlers, component builders (select menus: user/channel/role/string, buttons, submenus, modals, back navigation).
- **Rules**: Zero cross-module imports, `#lib/*`, `#database/*`, `#utilities/*` import aliases with `.js` extensions.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Architecture Inspection | Audit cards.ts, panel builders, Config, Hub, TempVC panels and handlers | none | DONE |
| 2 | UI Component & Panel Standardization | Standardize panel builders, select menus, button rows, card integration | M1 | DONE |
| 3 | SaaS Feature Panels Rewrite | Implement/Rewrite Config Panel, Hub Panel, TempVC Panel with SaaS submenus/navigation | M2 | DONE |
| 4 | Typecheck, Lint & Forensic Audit | Verification via `bun run typecheck`, `bun run lint`, and Forensic Auditor | M3 | IN_PROGRESS |

## Interface Contracts
### Interactive Panel Builder Specification
- Panel Builders return Discord component rows (`ActionRowBuilder`) with structured select menus (`UserSelectMenuBuilder`, `ChannelSelectMenuBuilder`, `RoleSelectMenuBuilder`, `StringSelectMenuBuilder`) and navigation buttons.
- Card formatters return standard embeds via `makeCard` / `noPingCard` / `makeInfoCard` / `makeSuccessCard` / `makeErrorCard`.
- Submenus provide explicit back navigation customIds (e.g. `panel:back`, `config:main`, `tempvc:main`).

## Code Layout
- `packages/core/src/lib/utilities/cards.ts` — Core card UI helpers
- `packages/core/src/lib/utilities/panels.ts` (or similar panel helper utilities)
- `packages/core/src/modules/config/` — Config Panel commands, submenus, handlers
- `packages/core/src/modules/hub/` or `packages/core/src/modules/module_manager/` — Module Hub Panel
- `packages/core/src/modules/temp_vc/` — TempVC Panel commands and handlers
