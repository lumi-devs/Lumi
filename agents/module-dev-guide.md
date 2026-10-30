# Module Development Guide

This guide covers creating, testing, and publishing first-party modules for Lumi v2.

## Quick Start

```bash
# 1. Create module directory
mkdir modules/my-module
cd modules/my-module

# 2. Create manifest.json
cat > manifest.json << 'EOF'
{
  "apiVersion": 2,
  "name": "my-module",
  "displayName": "My Module",
  "emoji": "✨",
  "description": "A short description",
  "version": "0.1.0",
  "entry": "index.ts",
  "dependencies": {},
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
  name: "my-module",
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

## Module Anatomy

```
modules/my-module/
├── manifest.json       # Required: metadata, deps, entry point
├── index.ts            # Required: module definition export
├── commands/           # Optional: command files
│   └── my-command.ts
├── listeners/          # Optional: event listeners
│   └── my-listener.ts
├── services/           # Optional: internal services
│   └── my-service.ts
└── tests/              # Optional: vitest tests
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
| `entry`        | ✅       | Relative path to definition file                            |
| `dependencies` | ❌       | Other modules: `{ "supermodule-name": "^2.0.0" }`           |
| `requirements` | ❌       | NPM packages: `["lodash@^4.17.21"]`                         |
| `conflicts`    | ❌       | Module names that cannot co-exist                           |
| `capabilities` | ❌       | Descriptive metadata only; validated but not acted on       |
| `configKey`    | ❌       | Stored settings key when it differs from `name`             |
| `configFields` | ❌       | `/lumi` settings metadata; defaults to `[]`                 |

---

## Configuration Schema

Use **Zod** for validation. The parsed `config` shape is stored per guild in
`Guild.settings`; the Zod schema itself is not persisted.

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

  // Optional: permit node this command maps to. It feeds the permit catalog
  // and Explain Check; dispatch does not gate on it today.
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

    // Use database
    const row = await services.db.prisma.myTable.findUnique({
      where: { guildId },
    });
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
   dispatch does not enforce it, so check `services.permits` in `execute` when
   the command needs a runtime gate.
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
    await services.db.prisma.myLog.create({
      data: {
        guildId: message.guildId,
        userId: message.author.id,
        content: message.content,
      },
    });
  },
};
```

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
3. **Use services** — `services.db`, `services.config`, `services.redis`, `services.permits`
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
  redis: Redis; // ioredis instance
  db: {
    // Database access
    prisma: PrismaClient;
    permits: PermitRepository;
  };
  prisma: PrismaClient; // Same client, top-level shorthand
  permits: PermitRepository; // Permit evaluation
  modules: {
    // Module state
    isEnabled: (guildId: string, module: string) => boolean;
  };
  moduleLoader: ModuleLoader;
  moduleManager: ModuleManager;
  addons: AddonManager; // Throws if used before wiring
  scheduler: DistributedScheduler; // Cron jobs
  config: ConfigService; // Guild config get/set
  configService: ConfigService; // Same instance
  rpc: RpcServer; // Internal HTTP control server
  ui: typeof import("@lumi/ui"); // Import @lumi/ui directly
  discord: { PermissionFlagsBits }; // Discord.js constants
  observability: { healthMonitor: HealthMonitor; logger: Logger };
  __moduleName: string; // Set per module
}
```

The runtime bag is authoritative; `@lumi/module-kit` declares a loose subset of
these fields.

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
      db: { prisma: { myTable: { findUnique: vi.fn() } } },
      prisma: { myTable: { findUnique: vi.fn() } },
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

- [ ] `manifest.json` validates (apiVersion: 2, name matches dir, entry exists)
- [ ] Zod config schema covers all settings with defaults
- [ ] Manifest `configFields` metadata matches schema types
- [ ] All commands have `requiredPermit` or check `isEnabled`
- [ ] All listeners check `isEnabled` at start
- [ ] No `EmbedBuilder` usage — use `@lumi/ui` cards
- [ ] No direct imports of `src`, `modules/*`, or internal packages
- [ ] Dependencies declared in manifest (both modules + npm)
- [ ] No dependency cycles
- [ ] Tests pass (`bun run test`)
- [ ] Typecheck passes (`bun run typecheck`)
- [ ] Build passes (`bun run build`)

---

## Publishing (First-Party)

1. Module lives in `modules/<name>/`
2. Version bump in `manifest.json` and `index.ts`
3. PR merged to main
4. Released as part of Lumi v2 release

For addons (third-party), see [Addon Development Guide](./addon-dev-guide.md).
