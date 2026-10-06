import path from "node:path";
import fs, { promises as fsp } from "node:fs";
import { parseArgs } from "node:util";
import type { AddonInvocation } from "@lumi/contracts";
import { FakeAddonHost } from "@lumi/core/addon-test-harness";
import { runValidateAddon } from "@lumi/core/validate-addon";
import { CliExitError, runCreateAddon } from "../../../../scripts/create-addon.js";

export const help = `Usage: lumi addon <create|validate|test|dev> [args...]

  lumi addon create <name> [options]      Scaffold a new addon (same as
                                           \`bun run addon:create\`).
  lumi addon validate <addon-dir|repo>    Validate addon structure (same as
                                           \`bun run validate\`).
  lumi addon test <dir> [options]         Boot the addon in the real sandbox
                                           child process and report what it
                                           loaded.
  lumi addon dev <dir> [options]          Re-run \`addon test\` on every change
                                           under <dir> (smoke loop, not hot
                                           reload).

\`create\` and \`validate\` share their implementation with the standalone
\`bun run addon:create\` / \`bun run validate\` scripts - this is a thin
wrapper, not a second copy. Run "lumi addon <subcommand> --help" for
subcommand-specific options.
`;

const testHelp = `Usage: lumi addon test <dir> [options]

Boots the addon at <dir> in the real sandbox child process
(packages/core/src/runtime/addon-child.ts) with a fake host that answers
every RPC call with a no-op success, then reports what the addon loaded:
whether it came up at all, its commands, interaction-handler prefixes, and
scheduled-task names. This is a smoke harness, not a test framework - it
proves the addon boots and its pieces register, not that its logic is
correct.

Options:
  --invoke <command>    Also invoke this command once the addon is ready,
                         printing every RPC call it made while running.
  --guild-id <id>        Guild id passed to the invocation (default: "test-guild").
  --timeout <ms>         Max time to wait for ready/invocation (default: 15000).
  --help, -h             Show this help text.

Exit code is 1 if the addon fails to load, errors during --invoke, or times
out; 0 otherwise.
`;

const devHelp = `Usage: lumi addon dev <dir> [options]

Watches <dir> and re-runs \`lumi addon test <dir> [options]\` (debounced)
every time a file under it changes. Options are the same as \`addon test\`
and are forwarded to each run.

This is a smoke-test loop for catching load/registration errors quickly
while editing - it does not hot-reload code into a running bot. Restart the
worker yourself to pick up changes there.

Press Ctrl+C to stop.
`;

const DefaultTimeoutMs = 15_000;
const DevDebounceMs = 300;

function parseTimeout(raw: string | undefined): number | null {
  if (raw === undefined) return DefaultTimeoutMs;
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function runAddonTest(argv: string[]): Promise<number> {
  let values: { invoke?: string; "guild-id"?: string; timeout?: string; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: {
        invoke: { type: "string" },
        "guild-id": { type: "string" },
        timeout: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
      strict: true,
    }));
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(testHelp);
    return 2;
  }

  if (values.help) {
    console.log(testHelp);
    return 0;
  }

  const dir = positionals[0];
  if (!dir || positionals.length > 1) {
    console.error(testHelp);
    return 2;
  }

  const timeoutMs = parseTimeout(values.timeout);
  if (timeoutMs === null) {
    console.error(`Invalid --timeout "${values.timeout}" (expected a positive number of milliseconds).`);
    return 2;
  }

  const absDir = path.resolve(dir);
  const name = path.basename(absDir);
  const host = new FakeAddonHost({ name, dir: absDir });

  try {
    const ready = await withTimeout(
      host.ready(),
      timeoutMs,
      `Addon "${name}" did not report ready within ${timeoutMs}ms`,
    );

    console.log(`loaded "${name}" from ${absDir}`);
    console.log(`  commands: ${ready.commands.map((c) => c.name).join(", ") || "(none)"}`);
    console.log(`  interaction prefixes: ${ready.interactionPrefixes.join(", ") || "(none)"}`);
    console.log(`  tasks: ${ready.tasks.join(", ") || "(none)"}`);

    if (values.invoke) {
      const command = ready.commands.find((c) => c.name === values.invoke);
      if (!command) {
        console.error(
          `No command "${values.invoke}" (available: ${ready.commands.map((c) => c.name).join(", ") || "none"}).`,
        );
        return 1;
      }

      const invocation: AddonInvocation = {
        kind: "command",
        invocationId: "cli-invoke",
        piece: command.name,
        guildId: values["guild-id"] ?? "test-guild",
        channelId: "test-channel",
        isSlash: true,
        subcommand: null,
        user: { id: "1", username: "tester", displayName: "Tester", bot: false, avatarUrl: null },
        member: null,
      };

      await withTimeout(
        host.invoke(invocation),
        timeoutMs,
        `"${command.name}" did not finish within ${timeoutMs}ms`,
      );

      const calls = host.rpcCalls();
      console.log(`\ninvoked "${command.name}"; RPC calls made:`);
      for (const call of calls) console.log(`  - ${call}`);
      if (calls.length === 0) console.log("  (none)");
    }

    return 0;
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    host.stop();
  }
}

async function runAddonDev(argv: string[]): Promise<number> {
  if (argv[0] === "--help" || argv[0] === "-h") {
    console.log(devHelp);
    return 0;
  }

  const dir = argv[0];
  if (!dir) {
    console.error(devHelp);
    return 2;
  }

  const absDir = path.resolve(dir);
  if (!(await fsp.stat(absDir).then((s) => s.isDirectory(), () => false))) {
    console.error(`"${absDir}" is not a directory.`);
    return 2;
  }

  const runOnce = async (): Promise<void> => {
    console.log(`\n[${new Date().toLocaleTimeString()}] running addon test...`);
    const code = await runAddonTest(argv);
    console.log(code === 0 ? "ok" : `failed (exit ${code})`);
  };

  await runOnce();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void runOnce(), DevDebounceMs);
  };

  let watcher: ReturnType<typeof fs.watch>;
  try {
    watcher = fs.watch(absDir, { recursive: true }, schedule);
  } catch {
    console.error(
      `Recursive directory watching is unsupported on this platform; watching ${absDir} itself only (not subdirectories).`,
    );
    watcher = fs.watch(absDir, schedule);
  }

  console.log(`\nWatching ${absDir} for changes. Press Ctrl+C to stop.`);
  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      watcher.close();
      if (timer) clearTimeout(timer);
      resolve();
    });
  });
  return 0;
}

export async function run(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "--help" || sub === "-h") {
    console.log(help);
    return 0;
  }
  if (!sub) {
    console.error(help);
    return 2;
  }

  if (sub === "create") {
    try {
      return await runCreateAddon(rest);
    } catch (err) {
      if (err instanceof CliExitError) return err.exitCode;
      throw err;
    }
  }

  if (sub === "validate") {
    return runValidateAddon(rest);
  }

  if (sub === "test") {
    return runAddonTest(rest);
  }

  if (sub === "dev") {
    return runAddonDev(rest);
  }

  console.error(`Unknown addon subcommand "${sub}". Expected "create", "validate", "test", or "dev".`);
  return 2;
}
