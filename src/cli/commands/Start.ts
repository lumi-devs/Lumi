import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

export const help = `Usage: lumi start

Start the bot. Runs \`bun src/Index.ts\`, inheriting stdio and forwarding
SIGINT/SIGTERM to the bot process.
`;

export async function run(argv: string[]): Promise<number> {
  const target = argv[0];
  if (target === "--help" || target === "-h") {
    console.log(help);
    return 0;
  }
  if (target) {
    console.error(`Unknown start target "${target}". Usage: lumi start`);
    return 2;
  }

  const proc = Bun.spawn(["bun", path.join(REPO_ROOT, "src", "Index.ts")], {
    cwd: REPO_ROOT,
    env: process.env,
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
