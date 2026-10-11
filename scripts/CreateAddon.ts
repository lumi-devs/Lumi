#!/usr/bin/env bun

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

export class CliExitError extends Error {
  constructor(public readonly exitCode: number) {
    super(`cli exited with code ${exitCode}`);
  }
}

function usage(): never {
  console.error(
    [
      "Usage: bun run addon:create <name> [options]",
      "",
      "Options:",
      "  --dir <path>           Parent directory to scaffold into (default: ./addons)",
      "  --display-name <text>  Human-facing name (default: Title Cased <name>)",
      "  --author <name>        Author credited in manifest.json (default: $USER or \"Your Name\")",
      "  --force                Overwrite an existing directory",
      "",
      "Example:",
      "  bun run addon:create welcome-messages",
    ].join("\n"),
  );
  throw new CliExitError(2);
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
    throw new CliExitError(2);
  }

  return { name, dir, displayName: displayName || titleCase(name), author, force };
}

function manifestJson(args: Args): string {
  return (
    JSON.stringify(
      {
        name: args.name,
        displayName: args.displayName,
        emoji: "✨",
        description: `${args.displayName} - describe what this addon does.`,
        version: "1.0.0",
        author: [args.author],
        configFields: [
          {
            key: "enabled_message",
            label: "Message",
            type: "STRING",
            description: "Example config field - replace with whatever this addon actually needs.",
            default: `Hello from ${args.displayName}!`,
          },
        ],
        requirements: [],
        end_user_data_statement: "This addon does not store any personal user data.",
      },
      null,
      2,
    ) + "\n"
  );
}

function indexTs(args: Args): string {
  return `import { defineModule } from "#src/lib/module-system/Module.js";

export default defineModule({
  name: "${args.name}",
  displayName: "${args.displayName}",
  emoji: "✨",
  version: "1.0.0",
  description: "${args.displayName} - describe what this addon does.",
  async deleteUserData(services, userId) {},
  async exportUserData(services, userId) {
    return null;
  },
});
`;
}

function commandTs(args: Args): string {
  const commandName = args.name.replace(/-/g, "_").slice(0, 32);
  return `import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";

export const ${commandName}Def: CommandDef = {
  name: "${commandName}",
  description: "${args.displayName} command.",
  guildOnly: true,
  cooldownMs: 5_000,
  build: () =>
    new SlashCommandBuilder().setName("${commandName}").setDescription("${args.displayName} command."),
  run: async (ctx) => {
    await ctx.replySuccess("${args.displayName}", "Hello!");
  },
};
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

Before publishing, see the [Addon Publishing Guide](https://lumi-devs.github.io/Lumi-docs/addons/distribution) and run:

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

export async function runCreateAddon(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const target = path.join(args.dir, args.name);

  if (await pathExists(target)) {
    if (!args.force) {
      console.error(
        `${RED}✗${RESET} ${path.relative(ROOT, target)} already exists. Pass ${BOLD}--force${RESET} to overwrite, or pick a different name.`,
      );
      throw new CliExitError(1);
    }
    console.log(`${YELLOW}⚠${RESET}  Overwriting existing ${path.relative(ROOT, target)} (--force).`);
  }

  await fs.mkdir(path.join(target, "commands"), { recursive: true });

  await fs.writeFile(path.join(target, "manifest.json"), manifestJson(args));
  await fs.writeFile(path.join(target, "Index.ts"), indexTs(args));
  await fs.writeFile(
    path.join(target, "commands", `${args.name.replace(/-/g, "_").slice(0, 32)}.ts`),
    commandTs(args),
  );
  await fs.writeFile(path.join(target, "README.md"), readmeMd(args));

  console.log(`\n${GREEN}✓${RESET} Scaffolded ${BOLD}${args.name}${RESET} at ${DIM}${path.relative(ROOT, target)}${RESET}\n`);
  console.log(
    [
      `  ${path.relative(ROOT, target)}/`,
      `  ├── manifest.json`,
      `  ├── index.ts`,
      `  ├── commands/${args.name.replace(/-/g, "_").slice(0, 32)}.ts`,
      `  └── README.md`,
    ].join("\n"),
  );
  console.log(`\n${BOLD}Next steps${RESET}`);
  console.log(`  1. Edit ${DIM}${path.relative(ROOT, target)}/index.ts${RESET} and the command stub.`);
  console.log(
    `  2. Add ${DIM}LUMI_DEV_PATHS=${path.relative(ROOT, args.dir) || "./addons"}${RESET} to .env (see https://lumi-devs.github.io/Lumi-docs/addons/overview).`,
  );
  console.log(`  3. Restart the worker, then ${DIM}/modules enable ${args.name}${RESET} in your test server.`);
  console.log(`  4. ${DIM}bun run validate ${path.relative(ROOT, target)}${RESET} before publishing.`);
  return 0;
}

if (import.meta.main) {
  runCreateAddon(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      if (err instanceof CliExitError) process.exit(err.exitCode);
      throw err;
    });
}
