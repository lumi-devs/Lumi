# Addon Development Guide

Addons are third-party modules installed at runtime. They follow the same module contract as first-party modules but have stricter security boundaries.

## Key Differences from Bundled Modules

| Aspect | Bundled Modules | Addons |
|--------|-----------------|--------|
| Location | `modules/<name>/` | `data/addons/<name>@<version>/` |
| Origin | `bundled` | `addon` |
| Installation | Deployed with bot | Installed through `/lumi` → Add-ons by a bot owner or `Extra Owner` |
| Updates | Bot update | Independent via downloader |
| NPM deps | In monorepo `package.json` | Declared in manifest `requirements` |
| Trust level | Full | Untrusted — validated on install |

---

## Addon Manifest

Same as bundled modules, but `requirements` are mandatory for npm deps.

```json
{
  "apiVersion": 2,
  "name": "my-addon",
  "displayName": "My Addon",
  "emoji": "🔌",
  "description": "Addon description",
  "version": "1.0.0",
  "entry": "./index.js",
  "dependencies": { "leveling": "^2.0.0" },
  "requirements": ["lodash@^4.17.21", "date-fns@^3.0.0"],
  "conflicts": [],
  "capabilities": [],
  "minBotVersion": "2.0.0",
  "maxBotVersion": "2.9.9"
}
```

### Requirements Rules

- **Must be registry semver specs**: `"pkg@^1.2.3"`, `"@scope/pkg@~2.0.0"`
- **No `package.json`** — only manifest `requirements` are read
- **Installed with**: `bun install --production --ignore-scripts --no-save`
- **No lifecycle scripts** — `--ignore-scripts` prevents install-time execution
- **Pinned to version** — each addon version gets its own `node_modules`

---

## Security Model

### What Addons CANNOT Do

| Restricted | Reason |
|------------|--------|
| Import `@lumi/db` | Database access |
| Import `@lumi/redis` | Direct Redis access |
| Import `@lumi/cache` | Cache manipulation |
| Import `@lumi/module-runtime` | Module lifecycle control |
| Import `@lumi/downloader` | Addon installation |
| Import `apps/bot/src/**` | App internals |
| Import other addons | Isolation |
| `require('fs')`, `require('child_process')` | Filesystem/process access |
| `eval`, `Function` constructor | Code execution |
| `globalThis`, `process` access | Environment access |

### What Addons CAN Do

- Use `@lumi/module-kit` types (interfaces only)
- Use `@lumi/ui` card builders
- Use `discord.js` for commands/listeners
- Use allowed npm packages (declared in `requirements`)
- Access `services` passed to `onLoad`, commands, listeners
- Store data via `services.db` (Prisma) — **scoped to their own tables**

### Services Available to Addons

```ts
interface AddonServices {
  // Same as ModuleServices EXCEPT:
  db: {
    prisma: PrismaClient;  // Full Prisma, but addon tables are prefixed
  };
  // NOT available:
  // - permits (use Discord permissions instead)
  // - scheduler (use Discord scheduled events or external cron)
  // - rpc
}
```

### Database Isolation

Addons get their own table prefix: `addon_<name>_<table>`.

```ts
// In addon code:
await services.db.prisma.addon_myaddon_mytable.create({ ... });

// Prisma schema for addons is generated at install time
// from the addon's own prisma/ directory (optional)
```

---

## Addon Structure

```
my-addon/
├── manifest.json
├── index.js              # Compiled JS (TypeScript compiled to JS)
├── package.json          # Optional: for local dev only (not used at runtime)
├── prisma/               # Optional: addon-specific schema
│   └── schema.prisma
├── commands/
│   └── my-command.js
├── listeners/
│   └── my-listener.js
└── README.md
```

---

## Publishing an Addon

### 1. Repository Setup

```bash
# Initialize as git repo
git init
npm init -y  # For local dev only
npm install -D typescript @lumi/module-kit discord.js
```

### 2. Write Addon Code

Use TypeScript, compile to `index.js`:
```bash
npx tsc --target ES2022 --module NodeNext --moduleResolution NodeNext --outDir .
```

### 3. Tag Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 4. Installation by Users

Users install via the dashboard or CLI:
```
/lumi addon install github:owner/repo@v1.0.0
/lumi addon install npm:@scope/my-addon@1.0.0
/lumi addon install local:/path/to/addon
```

---

## Addon Validation (On Install)

The downloader validates:

1. **Manifest schema** — matches `ModuleManifest` type
2. **Name collision** — not conflicting with bundled module
3. **Entry point exists** — file at `entry` path
4. **Dependencies resolvable** — module deps exist, npm deps installable
5. **No prohibited imports** — static analysis of entry file
6. **Semver compatibility** — `minBotVersion`/`maxBotVersion` match

### Prohibited Import Detection

```ts
// These patterns trigger validation failure:
import "@lumi/db";
import { PrismaClient } from "@lumi/db";
require("@lumi/redis");
import * as fs from "fs";
eval("code");
new Function("code");
process.env.SECRET;
```

---

## Addon Development Workflow

### Local Development

```bash
# 1. Link addon to local bot for testing
cd /path/to/lumi-v2
ln -s /path/to/my-addon data/addons/my-addon@dev

# 2. Install npm deps (bot handles this, but for dev:)
cd data/addons/my-addon@dev
bun install --production --ignore-scripts --no-save

# 3. Reload addon in bot
/lumi addon reload my-addon
```

### Testing Checklist

- [ ] Manifest validates
- [ ] No prohibited imports
- [ ] Commands work with `isEnabled` check
- [ ] Listeners check `isEnabled`
- [ ] Config schema works
- [ ] Database operations use correct table prefix
- [ ] NPM deps install cleanly
- [ ] Works on bot reload

---

## Best Practices

1. **Minimal permissions** — only request npm deps you actually need
2. **No global state** — use `services.db` or `services.cache`
3. **Graceful degradation** — handle missing config, disabled guilds
4. **Version your schema** — if you change DB, bump version and migrate
5. **Document config** — `configFields` renders in `/lumi` panel
6. **Handle errors** — wrap in try/catch, log via `console.error`

---

## Example: Simple Addon

### manifest.json
```json
{
  "apiVersion": 2,
  "name": "quote",
  "displayName": "Quotes",
  "emoji": "💬",
  "description": "Save and recall quotes",
  "version": "1.0.0",
  "entry": "./index.js",
  "dependencies": {},
  "requirements": ["uuid@^9.0.0"],
  "conflicts": [],
  "capabilities": []
}
```

### index.ts (compile to index.js)
```ts
import { defineModule } from "@lumi/module-kit";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

export default defineModule({
  name: "quote",
  displayName: "Quotes",
  emoji: "💬",
  description: "Save and recall quotes",
  version: "1.0.0",
  config: z.object({
    maxQuotes: z.number().int().min(1).max(1000).default(100),
  }),
  configFields: [
    { key: "maxQuotes", label: "Max Quotes", type: "number", description: "Max quotes per guild" },
  ],
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("quote")
        .setDescription("Quote management")
        .addSubcommand(s => s
          .setName("add")
          .setDescription("Add a quote")
          .addStringOption(o => o.setName("text").setDescription("Quote text").setRequired(true))
          .addUserOption(o => o.setName("author").setDescription("Quote author").setRequired(true))
        )
        .addSubcommand(s => s
          .setName("get")
          .setDescription("Get a random quote")
        )
        .addSubcommand(s => s
          .setName("list")
          .setDescription("List all quotes")
        ),
      requiredPermit: "quote.manage",
      async execute(interaction, services) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId!;
        
        if (!services.modules.isEnabled(guildId, "quote")) {
          return interaction.reply(ephemeralCard(makeErrorCard("Disabled", "Quote module not enabled")));
        }
        
        const config = await services.config.get(guildId, "quote");
        
        if (sub === "add") {
          const text = interaction.options.getString("text", true);
          const author = interaction.options.getUser("author", true);
          
          // Use addon-prefixed table
          await services.db.prisma.addon_quote_quote.create({
            data: { id: uuidv4(), guildId, text, authorId: author.id, authorTag: author.tag }
          });
          
          return interaction.reply(ephemeralCard(makeSuccessCard("Quote Added", `"${text}" — ${author.tag}`)));
        }
        
        if (sub === "get") {
          const quotes = await services.db.prisma.addon_quote_quote.findMany({ where: { guildId } });
          if (!quotes.length) return interaction.reply(ephemeralCard(makeInfoCard("No Quotes", "Add one with /quote add")));
          
          const quote = quotes[Math.floor(Math.random() * quotes.length)];
          return interaction.reply(makeInfoCard("💬 Quote", `"${quote.text}"\n— ${quote.authorTag}`));
        }
        
        if (sub === "list") {
          const quotes = await services.db.prisma.addon_quote_quote.findMany({ where: { guildId }, take: 20 });
          const lines = quotes.map((q, i) => `\`${i+1}.\` "${q.text}" — ${q.authorTag}`);
          return interaction.reply(ephemeralCard(makeInfoCard("💬 Quotes", lines.join("\n") || "None")));
        }
      },
    },
  ],
  listeners: [],
  tasks: [],
  async onLoad(services) { console.log("[quote] Addon loaded"); },
  async onUnload(services) { console.log("[quote] Addon unloaded"); },
});
```

### Prisma Schema (optional, for type safety)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

model AddonQuoteQuote {
  id        String   @id @default(cuid())
  guildId   String   @map("guild_id")
  text      String
  authorId  String   @map("author_id")
  authorTag String   @map("author_tag")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([guildId])
  @@map("addon_quote_quote")
}
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Prohibited import: @lumi/db` | Addon imports internal package | Remove import, use `services.db` |
| `Dependency not found: leveling` | Module dep not loaded | Ensure dependency is installed/enabled |
| `NPM install failed: lodash` | Network/registry issue | Check `requirements` semver, try again |
| `Entry point not found` | `entry` path wrong | Fix `manifest.json` entry path |
| `Module name collision` | Name matches bundled module | Rename addon |

---

## Resources

- [Module Development Guide](./module-dev-guide.md) — shared patterns
- [Module Kit API](../packages/module-kit/src/index.ts) — TypeScript contracts
- [Downloader Source](../packages/downloader/src/index.ts) — install logic