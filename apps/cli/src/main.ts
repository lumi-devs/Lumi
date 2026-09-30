#!/usr/bin/env bun
import { parseArgs } from "node:util";
import * as addon from "./commands/addon.js";
import * as config from "./commands/config.js";
import * as migrate from "./commands/migrate.js";
import * as moduleCmd from "./commands/module.js";
import * as start from "./commands/start.js";

const VERSION = "0.1.0";

interface CliCommand {
  name: string;
  summary: string;
  help: string;
  run(argv: string[]): Promise<number>;
}

const COMMANDS: CliCommand[] = [
  { name: "start", summary: "Start worker/api/scheduler (or all).", help: start.help, run: start.run },
  { name: "migrate", summary: "Run Prisma migrations (deploy|status).", help: migrate.help, run: migrate.run },
  { name: "addon", summary: "Scaffold or validate an addon.", help: addon.help, run: addon.run },
  { name: "module", summary: "Inspect bundled modules.", help: moduleCmd.help, run: moduleCmd.run },
  { name: "config", summary: "Print resolved environment configuration.", help: config.help, run: config.run },
];

function printTopLevelHelp(): void {
  console.log(`Usage: lumi <command> [options]\n`);
  console.log("Commands:");
  const width = Math.max(...COMMANDS.map((c) => c.name.length));
  for (const c of COMMANDS) console.log(`  ${c.name.padEnd(width)}  ${c.summary}`);
  console.log(`\nRun "lumi <command> --help" for command-specific options.`);
}

/**
 * Parses and dispatches a raw argv (e.g. `process.argv.slice(2)`). Exported
 * so tests can drive the CLI's routing/help/exit-code behavior without
 * spawning a real `bun` process for every case.
 *
 * `node:util`'s `parseArgs` only ever sees the argv *before* a command name
 * is known (bare `lumi`, `lumi --help`, `lumi -v`) - once a command name is
 * found, everything after it is handed to that command's own `run()`
 * untouched. Running `parseArgs` over the *whole* argv would misparse
 * subcommand-specific flags it doesn't know about (e.g. `lumi addon create
 * foo --dir /x` - an undeclared `--dir` would swallow `/x` as a boolean
 * flag's value became a stray positional instead of `--dir`'s argument).
 */
export async function runCli(argv: string[]): Promise<number> {
  const commandName = argv[0];

  if (!commandName || commandName.startsWith("-")) {
    const { values } = parseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: false,
      strict: false,
    });

    if (values["version"]) {
      console.log(VERSION);
      return 0;
    }

    printTopLevelHelp();
    return values["help"] ? 0 : 2;
  }

  const rest = argv.slice(1);
  const command = COMMANDS.find((c) => c.name === commandName);
  if (!command) {
    console.error(`Unknown command "${commandName}".\n`);
    printTopLevelHelp();
    return 2;
  }

  return command.run(rest);
}

if (import.meta.main) {
  runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.stack ?? err.message : err);
      process.exit(1);
    });
}
