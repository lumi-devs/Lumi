import { checkDatabase } from "./database.ts";
import { checkRedis } from "./redis.ts";
import { envRecord, runCommand } from "./shared.ts";

export async function waitForDependencies(
  values: ReadonlyMap<string, string>,
): Promise<{ redis: string | null; database: string | null }> {
  let redis: string | null = null;
  let database: string | null = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    redis = await checkRedis(values);
    database = await checkDatabase(values);
    if (redis === null && database === null) break;
    if (attempt < 10) {
      process.stdout.write(`  Waiting for dependencies (${attempt}/10)...\n`);
      await Bun.sleep(2_000);
    }
  }
  return { redis, database };
}

export async function startComposeDeps(
  values: ReadonlyMap<string, string>,
): Promise<boolean> {
  if (!Bun.which("docker")) {
    process.stderr.write(
      "  Docker was not found. Install Docker or start PostgreSQL and Redis yourself.\n",
    );
    return false;
  }
  process.stdout.write(
    "  Starting postgres and redis with Docker Compose...\n",
  );
  const result = await runCommand(
    "docker",
    ["compose", "up", "-d", "postgres", "redis"],
    envRecord(values),
    false,
  );
  if (result.code !== 0) {
    process.stderr.write(
      "  Docker Compose could not start the dependencies.\n",
    );
    return false;
  }
  return true;
}

export function printDependencyHelp(): void {
  process.stderr.write(`
Start the dependencies, then run setup again:

  docker compose up -d postgres redis
  bun run setup

Without Docker:

  PostgreSQL 18+ and Redis 8+ must be running, and DATABASE_URL / REDIS_URL
  in .env must point at them. On Debian/Ubuntu:
    sudo apt install postgresql redis-server
    sudo systemctl enable --now postgresql redis
`);
}
