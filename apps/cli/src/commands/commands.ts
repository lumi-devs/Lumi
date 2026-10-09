import path from "node:path";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { commandRegistry, loadCommandDefs } from "@lumi/core/command-def";
import { finalizeBuilder } from "@lumi/core/command-dispatch";
import { envParseString, getBotToken, getDevModulePaths } from "@lumi/core/env";
import { DefaultModuleRoot, walk } from "@lumi/core/generate-manifests";

export const help = `Usage: lumi commands deploy [--guild <id>]

Collects every module's CommandDefs (packages/core/src/modules/*, plus any
extra LUMI_DEV_PATHS roots - the same directory walk \`bun run
modules:manifest\` uses), finalizes their builders with the shared Discord
defaults, and overwrites Discord's command list with a single full-overwrite
PUT. No diffing: whatever is deployed becomes the entire command set.

Options:
  --guild <id>    Deploy as guild commands to <id> instead of globally.
                  Global commands can take up to an hour to propagate;
                  guild commands update instantly (for testing).

Env: BOT_TOKEN, APPLICATION_ID.
`;

async function deploy(args: string[]): Promise<number> {
  let guildId: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--guild" || arg.startsWith("--guild=")) {
      guildId =
        arg === "--guild" ? args[++i] : arg.slice("--guild=".length);
      if (!guildId) {
        console.error(`Missing value for --guild.`);
        return 2;
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(help);
      return 0;
    } else {
      console.error(`Unknown option "${arg}". Expected --guild <id>.`);
      return 2;
    }
  }

  const roots = [DefaultModuleRoot, ...getDevModulePaths().map((p) => path.resolve(p))];
  const found: { dir: string; index: string }[] = [];
  for (const root of roots) {
    await walk(root, found);
  }
  for (const { dir } of found) {
    await loadCommandDefs(dir);
  }

  const body: unknown[] = [];
  let slash = 0;
  let menus = 0;
  const defs = [...new Set(commandRegistry.values())].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const def of defs) {
    if (def.build) {
      const built = def.build() as { toJSON?: unknown } | null;
      if (built !== null && built !== undefined) {
        body.push(
          typeof built === "object" && typeof built.toJSON === "function"
            ? finalizeBuilder(def).toJSON()
            : built,
        );
        slash++;
      }
    }
    if (def.contextMenu) {
      body.push(def.contextMenu.build().toJSON());
      menus++;
    }
  }

  const rest = new REST().setToken(getBotToken());
  const applicationId = envParseString("APPLICATION_ID");
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
      body,
    });
    console.log(
      `Deployed ${slash} slash + ${menus} context-menu commands to guild ${guildId} (${body.length} total).`,
    );
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body });
    console.log(
      `Deployed ${slash} slash + ${menus} context-menu commands globally (${body.length} total).`,
    );
  }
  return 0;
}

export async function run(argv: string[]): Promise<number> {
  const sub = argv[0] ?? "deploy";
  if (sub === "--help" || sub === "-h") {
    console.log(help);
    return 0;
  }
  if (sub !== "deploy") {
    console.error(`Unknown commands subcommand "${sub}". Expected "deploy".`);
    return 2;
  }
  return deploy(argv.slice(1));
}
