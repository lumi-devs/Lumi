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
  "entry": "./index.ts",
  "dependencies": {},
  "requirements": [],
  "conflicts": [],
  "capabilities": []
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
  configFields: [
    { key: "setting1", label: "Setting 1", type: "string", description: "Description" },
    { key: "setting2", label: "Setting 2", type: "number", description: "Description" },
  ],
  commands: [],      // Add commands here
  listeners: [],     // Add listeners here
  tasks: [],         // Add scheduled tasks here
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

| Field | Required | Description |
|-------|----------|-------------|
| `apiVersion` | ✅ | Must be `2` |
| `name` | ✅ | Lowercase, hyphenated, matches directory |
| `displayName` | ✅ | Human-readable name |
| `emoji` | ✅ | Single emoji for UI |
| `description` | ✅ | One-line description |
| `version` | ✅ | Semver (e.g., `0.1.0`) |
| `entry` | ✅ | Relative path to definition file |
| `dependencies` | ❌ | Other modules: `{ "leveling": "^0.1.0" }` |
| `requirements` | ❌ | NPM packages: `["lodash@^4.17.21"]` |
| `conflicts` | ❌ | Module names that cannot co-exist |
| `capabilities` | ❌ | Future: declare provided capabilities |
| `minBotVersion` | ❌ | Minimum Lumi version required |
| `maxBotVersion` | ❌ | Maximum Lumi version supported |

---

## Configuration Schema

Use **Zod** for validation. The `config` schema is persisted per-guild.

```ts
import { z } from "zod";

config: z.object({
  // Primitives
  stringSetting: z.string().default("value"),
  numberSetting: z.number().int().min(0).max(100).default(50),
  booleanSetting: z.boolean().default(true),
  
  // Discord-specific
  channelId: z.string().nullable().optional(),      // Single channel
  roleId: z.string().nullable().optional(),         // Single role
  channelIds: z.array(z.string()).default([]),      // Multi-channel
  roleIds: z.array(z.string()).default([]),         // Multi-role
  
  // Complex
  thresholds: z.record(z.object({
    action: z.enum(["warn", "timeout", "ban"]),
    duration: z.number().int().optional(),
  })).default({}),
  
  // Custom objects
  customObject: z.object({
    key1: z.string(),
    key2: z.number(),
  }).optional(),
})
```

### Config Field Types (for UI)

| Type | Zod | Description |
|------|-----|-------------|
| `string` | `z.string()` | Text input |
| `number` | `z.number()` | Number input |
| `boolean` | `z.boolean()` | Toggle |
| `channel` | `z.string()` | Single channel select |
| `role` | `z.string()` | Single role select |
| `multi-channel` | `z.array(z.string())` | Multi-channel select |
| `multi-role` | `z.array(z.string())` | Multi-role select |

---

## Commands

### Slash Command Definition

```ts
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { CommandDefinition } from "@lumi/module-kit";
import { createCard, errorCard, successCard } from "@lumi/ui";

export const myCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("my-command")
    .setDescription("Description shown in Discord")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt => opt
      .setName("input")
      .setDescription("Input description")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addUserOption(opt => opt
      .setName("target")
      .setDescription("Target user")
      .setRequired(false)
    ),
  
  // Optional: permit required to run (bypasses guild enablement if user has it)
  requiredPermit: "my-module.my-command",
  
  // Optional: autocomplete handler
  async autocomplete(interaction, services) {
    const focused = interaction.options.getFocused();
    const choices = ["option1", "option2", "option3"]
      .filter(c => c.includes(focused))
      .slice(0, 25);
    await interaction.respond(choices.map(c => ({ name: c, value: c })));
  },
  
  async execute(interaction: ChatInputCommandInteraction, services) {
    const input = interaction.options.getString("input", true);
    const target = interaction.options.getUser("target") ?? interaction.user;
    const guildId = interaction.guildId!;
    
    // Check module is enabled for this guild
    if (!services.modules.isEnabled(guildId, "my-module")) {
      await interaction.reply(ephemeralCard(makeErrorCard("Disabled", "Module not enabled")));
      return;
    }
    
    // Get guild config
    const config = await services.config.get(guildId, "my-module");
    
    // Use database
    const row = await services.db.prisma.myTable.findUnique({ where: { guildId } });
    
    // Use cache
    const cached = await services.cache.get("my-module", `key-${guildId}`);
    
    // Use permits
    const hasPermit = await services.permits.check(interaction.user.id, "my-module.my-command");
    
    await interaction.reply(
      ephemeralCard(makeSuccessCard("Done", `Processed: ${input}`)),
    );
  },
};
```

### Command Best Practices

1. **Always check `services.modules.isEnabled(guildId, name)`** at the start of `execute`
2. **Use `requiredPermit`** for fine-grained permissions
3. **Use `ephemeralCard(card)`** for non-public responses
4. **Use `@lumi/ui` cards** — never raw `EmbedBuilder` and never `embeds:`
5. **Validate inputs** — Discord validates required options, but check business logic
6. **Handle errors** — wrap in try/catch, reply with `errorCard`

---

## Listeners

### Event Listener Definition

```ts
import { Events, Message } from "discord.js";
import { ListenerDefinition } from "@lumi/module-kit";

export const myListener: ListenerDefinition = {
  event: Events.MessageCreate,
  async execute(message: Message, services) {
    // Skip DMs
    if (!message.guild) return;
    
    // Check module enabled
    if (!services.modules.isEnabled(message.guildId, "my-module")) return;
    
    // Skip bots
    if (message.author.bot) return;
    
    // Check config
    const config = await services.config.get(message.guildId, "my-module");
    if (!config.someFeature) return;
    
    // Do work...
    await services.db.prisma.myLog.create({
      data: { guildId: message.guildId, userId: message.author.id, content: message.content }
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
3. **Use services** — `services.db`, `services.cache`, `services.redis`, `services.permits`
4. **No side-effect imports** — listeners are called via the loader, not imported directly

---

## Tasks (Scheduled Jobs)

```ts
import { TaskDefinition } from "@lumi/module-kit";

export const myTask: TaskDefinition = {
  name: "cleanup",
  // Cron expression: minute hour day-of-month month day-of-week
  cron: "0 3 * * *",  // Daily at 3 AM UTC
  timezone: "UTC",
  async execute(services) {
    // Runs on ONE worker (leader-elected)
    const deleted = await services.db.prisma.myTable.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    console.log(`[my-module] Cleaned up ${deleted.count} rows`);
  },
};
```

### Task Types

| Type | `runOn` | Description |
|------|---------|-------------|
| Leader-only | `"leader"` | Runs on elected leader (default) |
| All workers | `"all"` | Runs on every worker |
| Single worker | `"single"` | Runs on one worker (distributed lock) |

---

## Services Available to Modules

```ts
interface ModuleServices {
  redis: Redis;                      // ioredis instance
  cache: Cache;                      // L1/L2 cache with invalidation
  db: {                              // Database access
    prisma: PrismaClient;
    permits: PermitRepository;
  };
  modules: {                         // Module state
    isEnabled: (guildId: string, module: string) => boolean;
  };
  permits: PermitRepository;         // Permit evaluation
  scheduler: DistributedScheduler;   // Cron jobs
  config: {                          // Guild config
    get: (guildId: string, key: string) => Promise<any>;
    set: (guildId: string, key: string, value: any) => Promise<void>;
  };
  ui: any;                           // Import @lumi/ui directly
  rpc: RpcServer;                    // Internal HTTP control server
  discord: { PermissionFlagsBits };  // Discord.js constants
  observability: { healthMonitor };  // Health checks
}
```

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
      cache: { get: vi.fn(), set: vi.fn() },
      permits: { check: vi.fn().mockResolvedValue(true) },
      ui: { successCard: (t, d) => ({ title: t, description: d, color: 0x00ff00 }) },
    };
  });
  
  it("should export valid module definition", async () => {
    const { default: mod } = await import("../index.js");
    expect(mod.name).toBe("my-module");
    expect(mod.commands).toHaveLength(1);
  });
});
```

Run tests:
```bash
bun test modules/my-module/tests/
```

---

## Module Checklist (Pre-Ship)

- [ ] `manifest.json` validates (apiVersion: 2, name matches dir, entry exists)
- [ ] Zod config schema covers all settings with defaults
- [ ] `configFields` metadata matches schema types
- [ ] All commands have `requiredPermit` or check `isEnabled`
- [ ] All listeners check `isEnabled` at start
- [ ] No `EmbedBuilder` usage — use `@lumi/ui` cards
- [ ] No direct imports of `apps/bot`, `modules/*`, or internal packages
- [ ] Dependencies declared in manifest (both modules + npm)
- [ ] No dependency cycles
- [ ] Tests pass (`bun test`)
- [ ] Typecheck passes (`bun run typecheck`)
- [ ] Build passes (`bun run build`)

---

## Publishing (First-Party)

1. Module lives in `modules/<name>/`
2. Version bump in `manifest.json` and `index.ts`
3. PR merged to main
4. Released as part of Lumi v2 release

For addons (third-party), see [Addon Development Guide](./addon-dev-guide.md).