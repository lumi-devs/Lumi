#!/usr/bin/env bun
/**
 * Addon scaffold generator - `bun run addon:create <name>`.
 *
 * Generates the minimal directory shape a real addon needs (`info.json`,
 * `index.ts` with `@DefineModule`/`cfg`, one command stub, a README) into
 * `./addons/<name>` by default - mirroring `examples/hello-world`,
 * the addon the Quick Start guide (docs/QUICK_START_ADDON.md) walks through.
 *
 * `./addons/` is a plain local scratch directory (gitignored), the same shape
 * `LUMI_DEV_PATHS` expects: point it at the directory *containing* one or more
 * addon folders, and the worker discovers each subdirectory as an addon on boot.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const ROOT = path.resolve(import.meta.dir, "..");
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

interface Args {
  name: string;
  dir: string;
  displayName: string;
  author: string;
  force: boolean;
}

function usage(): never {
  console.error(
    [
      "Usage: bun run addon:create <name> [options]",
      "",
      "Options:",
      "  --dir <path>           Parent directory to scaffold into (default: ./addons)",
      "  --display-name <text>  Human-facing name (default: Title Cased <name>)",
      "  --author <name>        Author credited in info.json (default: $USER or \"Your Name\")",
      "  --force                Overwrite an existing directory",
      "",
      "Example:",
      "  bun run addon:create welcome-messages",
    ].join("\n"),
  );
  process.exit(2);
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  let dir = path.join(ROOT, "addons");
  let displayName = "";
  let author = process.env["USER"] ?? process.env["USERNAME"] ?? "Your Name";
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--dir":
        dir = path.resolve(argv[++i] ?? usage());
        break;
      case "--display-name":
        displayName = argv[++i] ?? usage();
        break;
      case "--author":
        author = argv[++i] ?? usage();
        break;
      case "--force":
        force = true;
        break;
      case "-h":
      case "--help":
        usage();
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`${RED}Unknown option: ${arg}${RESET}`);
          usage();
        }
        positionals.push(arg);
    }
  }

  const name = positionals[0];
  if (!name) usage();
  if (!NAME_RE.test(name)) {
    console.error(
      `${RED}Invalid addon name "${name}"${RESET} - must match ${NAME_RE} (lowercase letters, digits, hyphens; must start with a letter or digit), since it also has to match the directory name.`,
    );
    process.exit(2);
  }

  return { name, dir, displayName: displayName || titleCase(name), author, force };
}

function infoJson(args: Args): string {
  return (
    JSON.stringify(
      {
        name: args.name,
        author: [args.author],
        description: `${args.displayName} - describe what this addon does.`,
        short: `${args.displayName} addon.`,
        version: "1.0.0",
        requirements: [],
        end_user_data_statement: "This addon does not store any personal user data.",
      },
      null,
      2,
    ) + "\n"
  );
}

function indexTs(args: Args): string {
  const className = titleCase(args.name).replace(/[^a-zA-Z0-9]/g, "") + "Module";
  return `import { cfg, DefineModule, Module } from "lumi";

@DefineModule({
  name: "${args.name}",
  displayName: "${args.displayName}",
  emoji: "✨",
  version: "1.0.0",
  description: "${args.displayName} - describe what this addon does.",
  configSchema: cfg.object({
    enabled_message: cfg.string({
      label: "Message",
      description: "Example config field - replace with whatever this addon actually needs.",
      default: "Hello from ${args.displayName}!",
    }),
  }),
})
export class ${className} extends Module {
  public override async deleteUserData(): Promise<void> {
    // TODO: if this addon ever persists anything keyed by a user ID (via
    // container.db.guildKV or container.redis), delete it here. Until then,
    // this no-op is the GDPR-compliant default - see docs/GUIDE_ADDON_PUBLISHING.md.
  }
}
`;
}

function commandTs(args: Args): string {
  const commandName = args.name.replace(/-/g, "_").slice(0, 32);
  const className = titleCase(args.name).replace(/[^a-zA-Z0-9]/g, "") + "Command";
  return `import { ApplyOptions } from "@sapphire/decorators";
import { container, type Command } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "lumi/commands";

@ApplyOptions<BaseCommand.Options>({
  name: "${commandName}",
  description: "${args.displayName} command.",
  cooldownDelay: 5_000,
})
export default class ${className} extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This command only works inside a server.");
    }

    const messageRaw = await container.db.config.getModuleConfig(
      ctx.guildId,
      "${args.name}",
      "enabled_message",
    );
    const message = typeof messageRaw === "string" ? messageRaw : null;

    return ctx.replySuccess("${args.displayName}", message ?? "Hello from ${args.displayName}!");
  }
}
`;
}

function readmeMd(args: Args): string {
  return `# ${args.displayName}

${args.displayName} - describe what this addon does.

## Commands

- \`/${args.name.replace(/-/g, "_").slice(0, 32)}\` - replies with the configured message.

## Configuration

- **Message** (\`enabled_message\`) - the text the command replies with. Editable via \`/config\` or the dashboard.

## Installing locally for testing

This directory was scaffolded by \`bun run addon:create\`. Point \`LUMI_DEV_PATHS\` at its
parent directory in \`.env\` (created for you at \`./addons\` by default):

\`\`\`sh
LUMI_DEV_PATHS=${path.relative(ROOT, path.dirname(path.join(args.dir, args.name))) || "./addons"}
\`\`\`

Restart the worker, then \`/modules enable ${args.name}\`.

Before publishing, see the [Addon Publishing Guide](../../docs/GUIDE_ADDON_PUBLISHING.md) and run:

\`\`\`sh
bun run validate ${path.join(path.relative(ROOT, args.dir) || "addons", args.name)}
\`\`\`
`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = path.join(args.dir, args.name);

  if (await pathExists(target)) {
    if (!args.force) {
      console.error(
        `${RED}✗${RESET} ${path.relative(ROOT, target)} already exists. Pass ${BOLD}--force${RESET} to overwrite, or pick a different name.`,
      );
      process.exit(1);
    }
    console.log(`${YELLOW}⚠${RESET}  Overwriting existing ${path.relative(ROOT, target)} (--force).`);
  }

  await fs.mkdir(path.join(target, "commands"), { recursive: true });

  await fs.writeFile(path.join(target, "info.json"), infoJson(args));
  await fs.writeFile(path.join(target, "index.ts"), indexTs(args));
  await fs.writeFile(
    path.join(target, "commands", `${args.name.replace(/-/g, "_").slice(0, 32)}.ts`),
    commandTs(args),
  );
  await fs.writeFile(path.join(target, "README.md"), readmeMd(args));

  console.log(`\n${GREEN}✓${RESET} Scaffolded ${BOLD}${args.name}${RESET} at ${DIM}${path.relative(ROOT, target)}${RESET}\n`);
  console.log(
    [
      `  ${path.relative(ROOT, target)}/`,
      `  ├── info.json`,
      `  ├── index.ts`,
      `  ├── commands/${args.name.replace(/-/g, "_").slice(0, 32)}.ts`,
      `  └── README.md`,
    ].join("\n"),
  );
  console.log(`\n${BOLD}Next steps${RESET}`);
  console.log(`  1. Edit ${DIM}${path.relative(ROOT, target)}/index.ts${RESET} and the command stub.`);
  console.log(
    `  2. Add ${DIM}LUMI_DEV_PATHS=${path.relative(ROOT, args.dir) || "./addons"}${RESET} to .env (see docs/QUICK_START_ADDON.md).`,
  );
  console.log(`  3. Restart the worker, then ${DIM}/modules enable ${args.name}${RESET} in your test server.`);
  console.log(`  4. ${DIM}bun run validate ${path.relative(ROOT, target)}${RESET} before publishing.`);
}

void main();
