---
title: "Quick Start: Your First Addon"
description: "Fastest path from a clean checkout to a working slash command."
---

The fastest path from a clean checkout to a working `/slash` command running inside your own Lumi instance. This page is deliberately narrow - for the full extension surface (config groups, listeners, services, scheduled tasks, i18n) see the [Module Creation Guide](/Lumi/guides/module-creation/); for the rules addons specifically run under and how to publish one, see the [Addon Publishing Guide](/Lumi/guides/addon-publishing/); for the complete SDK surface, see the [API Reference](/Lumi/api-reference/).

## Prerequisites

A running Lumi instance you can restart - either the local dev stack from [Self-Hosting](/Lumi/guides/self-hosting/), or an existing checkout with `bun install` already run and `.env` already configured (`bun run setup` does both if you haven't).

## 1. Scaffold the addon

```bash
bun run addon:create welcome-messages
```

This writes `./addons/welcome-messages/` (a gitignored scratch directory - `LUMI_DEV_PATHS` just needs *a* directory containing one or more addon folders, and `./addons` is the default):

```
addons/welcome-messages/
├── info.json                        # Downloader metadata
├── index.ts                         # @DefineModule + configSchema
├── commands/welcome_messages.ts     # one working slash command
└── README.md
```

`index.ts` out of the box:

```typescript
import { cfg, DefineModule, Module } from "lumi";

@DefineModule({
  name: "welcome-messages",
  displayName: "Welcome Messages",
  emoji: "✨",
  version: "1.0.0",
  description: "Welcome Messages - describe what this addon does.",
  configSchema: cfg.object({
    enabled_message: cfg.string({
      label: "Message",
      description: "Example config field - replace with whatever this addon actually needs.",
      default: "Hello from Welcome Messages!",
    }),
  }),
})
export class WelcomeMessagesModule extends Module {
  public override async deleteUserData(): Promise<void> {
    // No-op until this addon actually stores something keyed by a user ID.
  }
}
```

Every import comes from `"lumi"` or one of its subpaths (`"lumi/commands"`, `"lumi/ui"`, ...) - never Lumi's internal `#core/*`/`#lib/*`/`#utilities/*`/`#database/*` paths. That boundary is what keeps an addon working across core refactors; see [API Reference](/Lumi/api-reference/) for the full list of what's exported.

## 2. Point Lumi at it

Add to `.env` (created by `bun run setup`, or copy from `.env.example`):

```bash
LUMI_DEV_PATHS=./addons
```

Multiple dev directories are comma- or colon-separated: `LUMI_DEV_PATHS=./addons,../lumi-addons`. Never set this in production - it's a development-only escape hatch that skips the Downloader entirely.

## 3. Restart and enable

```bash
bun run dev
```

`LUMI_DEV_PATHS` directories are scanned exactly like bundled modules at startup - no manifest generation step required (that's only for `packages/core/src/modules/*`, see [Module Creation Guide](/Lumi/guides/module-creation/#step-10-generate-the-manifest)). Once the worker is up, enable it for your test server:

```
/modules enable welcome-messages
```

Run `/welcome_messages` - it replies with the configured message, read back through `ConfigService`:

```typescript
const messageRaw = await container.db.config.getModuleConfig(
  ctx.guildId,
  "welcome-messages",
  "enabled_message",
);
```

Change the message from `/config` or the dashboard's module config panel - it's live-editable, no restart needed.

## 4. Iterate

Edit `commands/welcome_messages.ts`, add a `listeners/` or `interaction-handlers/` folder as needed (see [Module Creation Guide](/Lumi/guides/module-creation/) for the full extension-point list), and restart the worker to pick up changes.

Before you consider it done, lint it:

```bash
bun run validate ./addons/welcome-messages
```

This runs the same structural checks the Downloader applies before loading a real addon - `info.json`/`index.ts` shape, the `scheduled-tasks/` naming trap, forbidden cross-module imports, raw `EmbedBuilder` usage, and a set of best-effort memory-leak heuristics (unstored/uncleared timers, listeners with no visible cleanup, unbounded module-level state) - all warnings, not hard failures, since static analysis can't be certain.

## 5. Ready to publish?

Move the directory into a checkout of [`lumi-addons`](https://github.com/lumi-devs/lumi-addons) (or your own addon repository) and follow the [Addon Publishing Guide](/Lumi/guides/addon-publishing/) - it covers `deleteUserData`, translations, the pre-submission checklist, and the PR workflow in full.

## Going further

Two more worked examples ship in [`examples/`](https://github.com/lumi-devs/Lumi/blob/main/examples/), each README self-contained:

| Example | Shows |
| :--- | :--- |
| [`hello-world`](https://github.com/lumi-devs/Lumi/blob/main/examples/hello-world/) | The shape above - one command, one config field, one listener with a custom `resolveGuildId`. |
| [`tag-manager`](https://github.com/lumi-devs/Lumi/blob/main/examples/tag-manager/) | Multiple config field types, `container.db.guildKV` persistence. |
| [`giveaway`](https://github.com/lumi-devs/Lumi/blob/main/examples/giveaway/) | Interaction handlers (buttons, modals), a service class, and a scheduled task - the giveaway addon referenced throughout the Module Creation Guide's more advanced steps. |

