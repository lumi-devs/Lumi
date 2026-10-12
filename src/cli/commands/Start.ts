import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

export const help = `Usage: lumi start [--dry-run]

Start the bot. Runs \`bun src/Index.ts\`, inheriting stdio and forwarding
SIGINT/SIGTERM to the bot process.

With --dry-run, boots services and checks Postgres/Valkey reachability,
then exits before Discord login.
`;

export async function run(argv: string[]): Promise<number> {
  const target = argv[0];
  if (target === "--help" || target === "-h") {
    console.log(help);
    return 0;
  }
  if (target && target !== "--dry-run") {
    console.error(`Unknown start target "${target}". Usage: lumi start [--dry-run]`);
    return 2;
  }

  const proc = Bun.spawn(["bun", path.join(REPO_ROOT, "src", "Index.ts")], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...(target === "--dry-run" ? { LUMI_DRY_RUN: "1" } : {}),
    },
    stdio: ["inherit", "inherit", "inherit"],
  });

  const forward = (signal: NodeJS.Signals) => {
    try {
      proc.kill(signal);
    } catch {
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
