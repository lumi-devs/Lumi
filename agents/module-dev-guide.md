# Module Development Guide

This guide covers creating, testing, and publishing first-party modules for Lumi v2.

## Quick Start

Submodules live inside a supermodule group. Create the supermodule directory
first if the group does not exist yet; its manifest is metadata only.

```bash
# 1. Create the submodule directory inside its supermodule
mkdir -p modules/my-supermodule/my-module
cd modules/my-supermodule/my-module

# 2. Create manifest.json
cat > manifest.json << 'EOF'
{
  "apiVersion": 2,
  "name": "my-supermodule-my-module",
  "displayName": "My Module",
  "emoji": "✨",
  "description": "A short description",
  "version": "0.1.0",
  "entry": "index.ts",
  "dependencies": { "my-supermodule": "^2.0.0" },
  "requirements": [],
  "conflicts": [],
  "capabilities": [],
  "configFields": [
    { "key": "setting1", "label": "Setting 1", "type": "string", "description": "Description" },
    { "key": "setting2", "label": "Setting 2", "type": "number", "description": "Description" }
  ]
}
EOF

# 3. Create index.ts with module definition
cat > index.ts << 'EOF'
import { defineModule, type ModuleDefinition } from "@lumi/module-kit";
import { z } from "zod";

export default defineModule({
  name: "my-supermodule-my-module",
  displayName: "My Module",
  emoji: "✨",
  description: "A short description",
  version: "0.1.0",
  config: z.object({
    // Your config schema here
    setting1: z.string().default("default"),
    setting2: z.number().int().min(0).default(10),
  }),
  commands: [],      // Add commands here
  listeners: [],     // Add listeners here
  tasks: [],         // Reserved; see "Tasks" below
  // permitNodes: ["my-module.view"], // Optional nodes used by buttons/UI only
  async onLoad(services) {
    console.log("[my-module] Loaded");
    return []; // return disposers if needed
  },
  async onUnload(services) {
    console.log("[my-module] Unloaded");
  },
});
EOF
```

---

## Supermodules are groups

A supermodule is a rudimentary display container, not a module. Its
`manifest.json` contains only `apiVersion`, `name`, `displayName`, `emoji`,
`description`, and `version`:

```json
{
  "apiVersion": 2,
  "name": "my-supermodule",
  "displayName": "My Supermodule",
  "emoji": "📦",
  "description": "Groups related feature modules",
  "version": "2.0.0"
}
```

Do not add `entry`, `index.ts`, `configKey`, `configFields`, or enable/disable
state to a supermodule. The loader synthesizes a no-op definition for grouping
and never runs code from the supermodule directory.

## Module Anatomy

```
modules/<supermodule>/
├── manifest.json       # Required: group metadata only
└── <submodule>/
    ├── manifest.json   # Required: metadata, deps, entry point, config UI
    ├── index.ts        # Required: module definition export
    ├── commands/       # Optional: command files
    │   └── my-command.ts
    ├── listeners/      # Optional: event listeners
    │   └── my-listener.ts
    ├── services/       # Optional: internal services
    │   └── my-service.ts
    └── tests/          # Optional: vitest tests
        └── my-module.test.ts
```

---

## Manifest Fields

| Field          | Required | Description                                                 |
| -------------- | -------- | ----------------------------------------------------------- |
| `apiVersion`   | ✅       | Must be `2`                                                 |
| `name`         | ✅       | Lowercase, hyphenated; submodules use `<supermodule>-<dir>` |
| `displayName`  | ✅       | Human-readable name                                         |
| `emoji`        | ✅       | Single emoji for UI                                         |
| `description`  | ✅       | One-line description                                        |
| `version`      | ✅       | Semver (e.g., `0.1.0`)                                      |
| `entry`        | ✅       | Submodule entry, relative to the submodule directory        |
| `dependencies` | ❌       | Other modules: `{ "supermodule-name": "^2.0.0" }`           |
| `requirements` | ❌       | NPM packages: `["lodash@^4.17.21"]`                         |
| `conflicts`    | ❌       | Module names that cannot co-exist                           |
| `capabilities` | ❌       | Descriptive metadata only; validated but not acted on       |
| `configKey`    | ❌       | Stored settings key when it differs from `name`             |
| `configFields` | ❌       | `/lumi` settings metadata; defaults to `[]`                 |

Supermodule manifests use only the first six fields.

### Dependency policy

Bundled modules share the root `package.json` dependency set, matching Redbot's
central cogs and its `requirements/base.txt`. Do not add a bundled module's npm
packages to `manifest.requirements`; keep shared runtime dependencies at the
root so the bot remains a single install. `requirements` is for downloadable
add-ons, whose downloader installs them into the add-on directory. Declare
module-to-module dependencies in `dependencies` and incompatible module names in
`conflicts`.

`community-quote` is the exception used as a live example of the field: it
declares `makeitaquote@^12.1.6` in `manifest.requirements` without adding it to
the root package. Install it for local development with
`bun add --no-save --ignore-scripts makeitaquote@^12.1.6`; add-on installs run
that command automatically from the declared requirements. The renderer is
local, so quote generation does not depend on an external image API.

---

## Configuration Schema

Use **Zod** for validation. The parsed `config` shape is stored per guild in
`Guild.settings`; the Zod schema itself is not persisted. Configuration belongs
to submodules only; supermodules have no config.

```ts
import { z } from "zod";

config: z.object({
  // Primitives
  stringSetting: z.string().default("value"),
  numberSetting: z.number().int().min(0).max(100).default(50),
  booleanSetting: z.boolean().default(true),

  // Discord-specific
  channelId: z.string().nullable().optional(), // Single channel
  roleId: z.string().nullable().optional(), // Single role
  channelIds: z.array(z.string()).default([]), // Multi-channel
  roleIds: z.array(z.string()).default([]), // Multi-role

  // Complex
  thresholds: z
    .record(
      z.object({
        action: z.enum(["warn", "timeout", "ban"]),
        duration: z.number().int().optional(),
      }),
    )
    .default({}),

  // Custom objects
  customObject: z
    .object({
      key1: z.string(),
      key2: z.number(),
    })
    .optional(),
});
```

### Config Field Types (for UI)

Declare these in `manifest.json` `configFields`; they are not part of
`defineModule`. Each field supports `key`, `label`, `type`, optional
`description`, `required`, `default`, `category`, `min`, `max`, `choices`, and
`channelTypes`.

| Type            | Zod                        | Control                               |
| --------------- | -------------------------- | ------------------------------------- |
| `string`        | `z.string()`               | Text modal                            |
| `number`        | `z.number()`               | Number modal                          |
| `boolean`       | `z.boolean()`              | On/Off toggle                         |
| `channel`       | `z.string()`               | Channel picker                        |
| `role`          | `z.string()`               | Role picker                           |
| `multi-channel` | `z.array(z.string())`      | Multi-channel picker (`minValues: 0`) |
| `multi-role`    | `z.array(z.string())`      | Multi-role picker (`minValues: 0`)    |
| `select`        | `z.string()` + `choices`   | String select                         |
| `multi-string`  | `z.string()`               | Text modal (stored as one string)     |
| `json`          | `z.object()` / `z.array()` | JSON modal                            |
| `escalation`    | `z.record(...)`            | Warning-count → action rule editor    |

---

## Commands

### Slash Command Definition

```ts
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { CommandDefinition } from "@lumi/module-kit";
import { makeErrorCard, makeSuccessCard, ephemeralCard } from "@lumi/ui";

export const myCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("my-command")
    .setDescription("Description shown in Discord")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((opt) =>
      opt
        .setName("input")
        .setDescription("Input description")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addUserOption((opt) =>
      opt.setName("target").setDescription("Target user").setRequired(false),
    ),

  // Optional: permit node this command maps to. Dispatch blocks the command
  // unless the member has this node, and it feeds the permit catalog.
  requiredPermit: "my-module.my-command",

  // Optional: autocomplete handler
  async autocomplete(interaction, services) {
    const focused = interaction.options.getFocused();
    const choices = ["option1", "option2", "option3"]
      .filter((c) => c.includes(focused))
      .slice(0, 25);
    await interaction.respond(choices.map((c) => ({ name: c, value: c })));
  },

  async execute(interaction: ChatInputCommandInteraction, services) {
    const input = interaction.options.getString("input", true);
    const target = interaction.options.getUser("target") ?? interaction.user;
    const guildId = interaction.guildId!;

    // Check module is enabled for this guild
    if (!services.modules.isEnabled(guildId, "my-module")) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Disabled", "Module not enabled")),
      );
      return;
    }

    // Get guild config (returns unknown; validate or parse it)
    const config = await services.config.get(guildId, "my-module");
    void config;

    // Use helpers for every database/cache read or write
    const row = await services.helpers.leveling.findUser(
      guildId,
      interaction.user.id,
    );
    void row;

    // Use permits
    const hasPermit = (
      await services.permits.explainPermit(
        {
          guildId,
          userId: interaction.user.id,
          channelId: interaction.channelId,
          roleIds: [],
          permitNode: "my-module.my-command",
        },
        services.client,
      )
    ).allowed;
    void hasPermit;

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Done", `Processed: ${input} for ${target.username}`),
      ),
    );
  },
};
```

### Command Best Practices

1. **Always check `services.modules.isEnabled(guildId, name)`** at the start of `execute`
2. **Use `requiredPermit`** to attach the command to a permit node in the panel;
   dispatch enforces it before `execute` runs. Use `permitNodes` on the module
   definition for nodes that gate buttons/UI but no command (e.g. `stats.view`).
3. **Use `ephemeralCard(card)`** for non-public responses
4. **Use `@lumi/ui` cards** — never raw `EmbedBuilder` and never `embeds:`
5. **Validate inputs** — Discord validates required options, but check business logic
6. **Handle errors** — wrap in try/catch and reply with `makeErrorCard`

---

## Listeners

### Event Listener Definition

```ts
import { Events, Message } from "discord.js";
import type { ListenerDefinition } from "@lumi/module-kit";

export const myListener: ListenerDefinition = {
  event: Events.MessageCreate,
  async handler(message: Message, services) {
    // Skip DMs
    if (!message.guild) return;

    // Check module enabled
    if (!services.modules.isEnabled(message.guildId, "my-module")) return;

    // Skip bots
    if (message.author.bot) return;

    // Check config (stored value is unknown; parse it with your Zod schema)
    const config = (await services.config.get(message.guildId, "my-module")) as
      { someFeature?: boolean } | undefined;
    if (!config?.someFeature) return;

    // Do work...
    await services.helpers.stats.createEvent(
      message.guildId,
      "my-module.message",
      message.author.id,
      { channelId: message.channelId },
    );
  },
};
```

Module services always arrive as the final argument after the event arguments.
The loader type-erases handlers at the registration boundary, so declare only the
event parameters you use plus `services`.

### Available Events

Import from `discord.js` Events:

- `Events.MessageCreate` / `MessageUpdate` / `MessageDelete`
- `Events.GuildMemberAdd` / `GuildMemberRemove` / `GuildMemberUpdate`
- `Events.VoiceStateUpdate`
- `Events.InteractionCreate` (for components)
- `Events.GuildCreate` / `GuildDelete`
- And all other Discord.js events

### Listener Best Practices

1. **Early returns** — check guild, bot, enabled, config early
2. **Don't block** — listeners run synchronously in the event loop; defer heavy work
3. **Use services** — `services.helpers` for database/cache, `services.config`, `services.permits`
4. **No side-effect imports** — listeners are called via the loader, not imported directly

---

## Tasks (Scheduled Jobs)

`ModuleDefinition.tasks` is a reserved field in the contract; the loader does not
register or start module tasks today. Process-level jobs are registered on the
shared scheduler in `src/index.ts` (for example the add-on auto-update job).

```ts
import type { TaskDefinition } from "@lumi/module-kit";

export const myTask: TaskDefinition = {
  name: "cleanup",
  // Cron expression: minute hour day-of-month month day-of-week
  cron: "0 3 * * *", // Daily at 3 AM UTC
  timezone: "UTC",
  async handler(services) {
    // Not currently invoked by the module loader.
    console.log("[my-module] cleanup");
  },
};
```

`@lumi/scheduler` runs minute-granularity jobs with a Redis lock per tick and
exposes `register({ name, cron, handler, timezone?, lockTtlMs? })`; only
fixed-interval expressions (`*/N * * * *`) are scheduled exactly.

---

## Services Available to Modules

```ts
interface ModuleServices {
  client: Client; // Discord client
  permits: PermitRepository; // Permit evaluation
  modules: {
    // Module state
    isEnabled: (guildId: string, module: string) => boolean;
  };
  moduleConfig: ModuleConfigService; // Per-module config read/save
  helpers: DbHelpers; // Database + cache access
  scheduler: DistributedScheduler; // Cron jobs
  config: ModuleConfigAccess; // Guild config get/set
  ui: typeof import("@lumi/ui"); // Import @lumi/ui directly
  discord: { PermissionFlagsBits }; // Discord.js constants
  observability: { healthMonitor?: HealthMonitor; logger: Logger };
  moduleName?: string; // Set per module
}
```

`DbHelpers` exposes `leveling`, `economy`, `stats`, `tickets`, `roleMenus`,
`customCommands`, `roles`, `security`, `verification`, `utility`, and `cache`.
Modules must not import `@prisma/client`, `@lumi/db`, `@lumi/cache`,
`@lumi/redis`, or `ioredis`; Biome blocks those imports under `modules/**`.
The wide host bag (`prisma`, `redis`, `configService`, `moduleLoader`,
`moduleManager`, `addons`) is `BotServices` and is only available to built-in
code under `src/`. `servicesForModule()` is the only projection. See
[services.md](./services.md).

---

## Testing Modules

### Unit Tests

```ts
// modules/my-module/tests/my-module.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineModule } from "@lumi/module-kit";

describe("my-module", () => {
  let services: any;

  beforeEach(() => {
    services = {
      modules: { isEnabled: vi.fn().mockReturnValue(true) },
      config: { get: vi.fn().mockResolvedValue({}) },
      helpers: {
        leveling: { findUser: vi.fn().mockResolvedValue(null) },
        cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
      },
      permits: {
        explainPermit: vi.fn().mockResolvedValue({ allowed: true, rows: [] }),
      },
      ui: {
        makeSuccessCard: (t: string, d: string) => ({
          title: t,
          description: d,
        }),
      },
    };
  });

  it("should export valid module definition", async () => {
    const { default: mod } = await import("../index.ts");
    expect(mod.name).toBe("my-module");
    expect(mod.commands).toHaveLength(1);
  });
});
```

Run tests:

```bash
bun run test
# or a single file
bunx vitest run modules/my-module/tests/my-module.test.ts
```

---

## Module Checklist (Pre-Ship)

- [ ] Manifest validates (apiVersion: 2, name matches `<supermodule>-<dir>`, entry exists)
- [ ] Supermodule manifest is metadata-only (no entry, code, config, or toggle state)
- [ ] Zod config schema covers all settings with defaults
- [ ] Manifest `configFields` metadata matches schema types
- [ ] All commands have `requiredPermit` or check `isEnabled`
- [ ] All listeners check `isEnabled` at start
- [ ] No `EmbedBuilder` usage — use `@lumi/ui` cards
- [ ] No direct imports of `src`, `modules/*`, or internal packages
- [ ] Dependencies declared in manifest (both modules + npm, including the parent supermodule)
- [ ] No dependency cycles
- [ ] Tests pass (`bun run test`)
- [ ] Typecheck passes (`bun run typecheck`)
- [ ] Build passes (`bun run build`)

---

## Publishing (First-Party)

1. Submodule lives in `modules/<supermodule>/<submodule>/`
2. Version bump in `manifest.json` and `index.ts`
3. PR merged to main
4. Released as part of Lumi v2 release

For addons (third-party), see [Addon Development Guide](./addon-dev-guide.md).
