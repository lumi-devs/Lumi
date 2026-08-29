---
title: "Addon Publishing Guide"
description: "Guidelines and verification rules for publishing addons to lumi-addons."
category: "Addon SDK"
---

# Addon Publishing Guide

Addons are third-party (or first-party optional) modules distributed outside the core repository and installed dynamically via Lumi's Downloader. This guide covers packaging, GDPR compliance, static validation, and publishing to [`lumi-addons`](https://github.com/lumi-devs/lumi-addons).

## Installation Lifecycle

```sh
# 1. Register an addon repository
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git

# 2. Install an addon from the repository
,download install lumi-addons <addon-name>

# 3. Optionally install at a specific commit, branch, or tag
,download install lumi-addons <addon-name> <revision>

# 4. Roll back to a previous revision if needed
,download rollback <addon-name> <revision>

# 5. Enable the addon in a server
/modules enable <addon-name>
```

---

## Addon Structure

Every addon directory must contain `info.json` and `index.ts`:

```
my-addon/
├── info.json              # Downloader metadata (required)
├── index.ts               # Module entrypoint with @DefineModule (required)
├── README.md              # User documentation and setup guide
├── commands/              # Slash commands extending BaseCommand
├── listeners/             # Listeners extending ModuleListener
├── interaction-handlers/  # Button, modal, and select handlers
├── scheduled-tasks/       # Scheduled tasks extending RelayTask (exact name required)
└── lib/                   # Internal helper utilities
```

### `info.json` Specification

```json
{
  "name": "my-addon",
  "author": ["YourName"],
  "description": "Short explanation of addon capabilities.",
  "short": "One-line summary.",
  "version": "1.0.0",
  "requirements": [],
  "end_user_data_statement": "This addon stores no personal user data."
}
```

### `index.ts` Entrypoint

```typescript
import { Module, DefineModule, cfg, NoEndUserData } from "lumi";

@DefineModule({
  name: "my-addon",
  displayName: "My Addon",
  emoji: "🚀",
  version: "1.0.0",
  description: "What your addon does.",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Where events are posted.",
    }),
  }),
  endUserDataStatement: NoEndUserData(),
})
export class MyAddonModule extends Module {
  public override async deleteUserData(userId: string): Promise<void> {
    // Delete any user-keyed data from container.db.guildKV or Redis.
  }

  public override async exportUserData(userId: string): Promise<Record<string, unknown> | null> {
    return null;
  }
}
```

---

## Addon Development Rules

1. **Import Strictly from `"lumi"`**:
   Import only from public SDK entry points:
   - `"lumi"`
   - `"lumi/commands"`
   - `"lumi/permissions"`
   - `"lumi/scheduling"`
   - `"lumi/ui"`
   - `"lumi/utils"`
   Never import internal `#core/*`, `#lib/*`, `#database/*`, or `#utilities/*` paths.

2. **No Direct Database Access**:
   Never import or use `container.prisma`. Persist dynamic addon state via `container.db.guildKV`:
   ```typescript
   await container.db.guildKV.setModuleData(guildId, "my-addon", targetId, "key", value);
   ```

3. **No Direct `EmbedBuilder`**:
   Use `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, or `makeInfoCard` from `"lumi/ui"` (or `ctx.replySuccess` / `ctx.replyError` on `CommandContext`).

4. **Task Directory Naming**:
   Scheduled tasks must be placed in a directory named exactly `scheduled-tasks/` (not `tasks/`).

5. **GDPR Compliance**:
   Declare `end_user_data_statement` in `info.json` and implement `deleteUserData` / `exportUserData` hooks in `index.ts`.

---

## Static Validation

Run the addon validation script before submitting:

```bash
bun run validate ./addons/my-addon
```

The validator confirms:
- Valid `info.json` syntax and required properties.
- Proper `@DefineModule` configuration.
- Absence of forbidden internal imports and raw `EmbedBuilder` calls.
- Correct sub-store folder structure.

---

## Publishing Workflow

1. Fork [`lumi-addons`](https://github.com/lumi-devs/lumi-addons).
2. Add your addon directory at the root level of `lumi-addons`.
3. Verify typechecking and linting:
   ```bash
   bun run typecheck
   bun run lint
   ```
4. Open a Pull Request against `main`.


