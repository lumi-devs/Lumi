import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSupervisor, type ChildSpec } from "../lib/supervisor.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const TARGETS = ["worker", "api", "scheduler"] as const;
type Target = (typeof TARGETS)[number];

function isTarget(value: string): value is Target {
  return (TARGETS as readonly string[]).includes(value);
}

function entryFor(target: Target): string {
  return path.join(REPO_ROOT, "apps", target, "src", "main.ts");
}

export const help = `Usage: lumi start <worker|api|scheduler|all>

Start one Lumi process (spawns \`bun apps/<target>/src/main.ts\`, inheriting
this process's stdio and environment) or all three at once.

\`all\` runs a small supervisor: it spawns worker, api and scheduler as three
separate processes, prefixes every line of their output with [worker]/[api]/
[scheduler], and forwards SIGINT/SIGTERM to all three. If any one of them
exits non-zero, the supervisor terminates the other two and exits non-zero
itself.

Why not one process? worker/api/scheduler each bootstrap their own
@sapphire/framework \`container\` (the process-wide singleton core hangs
DB/Redis/client access off). Running all three bootstraps in one process
would have the second and third overwrite the first's container - so this
stays three processes under one command, not truly one address space.

Targets:
  worker      Discord gateway + every command/module/interaction handler.
  api         Gateway-free RPC server for the dashboard.
  scheduler   Gateway-free BullMQ worker/scheduler.
  all         All three, supervised together.
`;

async function startSingle(target: Target): Promise<number> {
  const proc = Bun.spawn(["bun", entryFor(target)], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["inherit", "inherit", "inherit"],
  });

  const forward = (signal: NodeJS.Signals) => {
    try {
      proc.kill(signal);
    } catch {
      // already exited
    }
  };
  process.on("SIGINT", forward);
  process.on("SIGTERM", forward);
  try {
    return await proc.exited;
  } finally {
    process.off("SIGINT", forward);
    process.off("SIGTERM", forward);
  }
}

async function startAll(): Promise<number> {
  const children: ChildSpec[] = TARGETS.map((target) => ({
    name: target,
    command: ["bun", entryFor(target)],
    cwd: REPO_ROOT,
  }));
  return runSupervisor(children);
}

export async function run(argv: string[]): Promise<number> {
  const target = argv[0];
  if (target === "--help" || target === "-h") {
    console.log(help);
    return 0;
  }
  if (!target) {
    console.error("Usage: lumi start <worker|api|scheduler|all>\n");
    console.error(help);
    return 2;
  }

  if (target === "all") return startAll();

  if (!isTarget(target)) {
    console.error(
      `Unknown start target "${target}". Expected one of: ${TARGETS.join(", ")}, all.`,
    );
    return 2;
  }

  return startSingle(target);
}
