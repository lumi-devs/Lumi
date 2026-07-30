# `@lumi/core`

The core framework, module system, command handler, and database service for Lumi.

## Features

- **Module System**: Dynamic `@DefineModule` decorator loader with per-guild config validation via `@sapphire/shapeshift`.
- **Database Service**: Centralized PostgreSQL client interface via `container.db` backed by Prisma ORM.
- **Card UI Rendering**: Standardized Discord message embeds and interactive card builders (`makeInfoCard`, `makeSuccessCard`, `makeErrorCard`).
- **Wick Permission Engine**: Wildcard node evaluation (`mod.*`, `admin.*`, `owner.*`) and Anti-Nuke Quarantine protection.
- **i18n Localization**: Crowdin-backed multi-locale translation manager (`packages/core/src/languages/`).

## Path Aliases

Imports within `@lumi/core` and 3rd-party addons use explicit path aliases (always requiring `.js` extensions):

| Alias | Target |
| :--- | :--- |
| `#lib/*.js` | `./src/lib/*.ts` |
| `#database/*.js` | `./src/lib/database/*.ts` |
| `#utilities/*.js` | `./src/lib/utilities/*.ts` |
| `#core/module-system/*.js` | `./src/lib/module-system/*.ts` |
