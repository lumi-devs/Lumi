export const DefaultDatabaseUrl =
  "postgresql://lumi:lumi@127.0.0.1:5432/lumi";
export const DefaultRedisUrl = "redis://localhost:6379/0";
const PlaceholderValues: Record<string, true> = {
  "change-me": true,
  changeme: true,
  "replace-me": true,
  replace_me: true,
  "your-token": true,
  your_bot_token: true,
  your_token: true,
  xxx: true,
};

export interface SetupOptions {
  yes: boolean;
  check: boolean;
  skipMigrate: boolean;
  skipGenerate: boolean;
  skipChecks: boolean;
  startDeps: boolean;
  skipDeps: boolean;
  compose?: boolean;
  help: boolean;
  token?: string;
  owners?: string;
  databaseUrl?: string;
  redisUrl?: string;
}

export interface EnvIssue {
  key: string;
  message: string;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function parseArgs(argv: readonly string[]): SetupOptions {
  const options: SetupOptions = {
    yes: false,
    check: false,
    skipMigrate: false,
    skipGenerate: false,
    skipChecks: false,
    startDeps: false,
    skipDeps: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.startsWith("--")
      ? arg.split("=", 2)
      : [arg, undefined];
    const takeValue = (name: string): string => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new Error(`${name} requires a value.`);
      }
      index++;
      return next;
    };

    switch (flag) {
      case "-y":
      case "--yes":
        options.yes = true;
        break;
      case "--check":
        options.check = true;
        break;
      case "--skip-migrate":
        options.skipMigrate = true;
        break;
      case "--skip-generate":
        options.skipGenerate = true;
        break;
      case "--skip-checks":
        options.skipChecks = true;
        break;
      case "--start-deps":
        options.startDeps = true;
        break;
      case "--skip-deps":
        options.skipDeps = true;
        break;
      case "--docker":
        options.compose = true;
        break;
      case "--no-docker":
        options.compose = false;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--token":
        options.token = takeValue("--token");
        break;
      case "--owners":
        options.owners = takeValue("--owners");
        break;
      case "--database-url":
        options.databaseUrl = takeValue("--database-url");
        break;
      case "--redis-url":
        options.redisUrl = takeValue("--redis-url");
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.startDeps && options.skipDeps) {
    throw new Error("Use either --start-deps or --skip-deps, not both.");
  }

  return options;
}

export function usage(): string {
  return `Usage: bun run setup [options]

Prepares the local environment for Lumi:
  - creates or updates .env without overwriting unrelated keys
  - generates missing Docker Compose secrets
  - checks PostgreSQL and Redis connectivity
  - runs Prisma generate and migrate deploy

Options:
  -y, --yes              Non-interactive; fail if required values are missing
      --check            Validate configuration and connectivity only
      --skip-migrate     Skip prisma migrate deploy
      --skip-generate    Skip prisma generate
      --skip-checks      Skip PostgreSQL and Redis connectivity checks
      --start-deps       Start Postgres and Redis with Docker Compose if needed
      --skip-deps        Never start Docker Compose dependencies
      --docker           Assume the bundled Docker Compose stack
      --no-docker        Assume Postgres and Redis are managed externally
      --token <token>    Discord bot token
      --owners <ids>     Comma-separated Discord user IDs
      --database-url <url>
      --redis-url <url>
  -h, --help             Show this help

Environment values already present in .env or the process environment are kept.
Secrets are never printed.`;
}

export function isPlaceholder(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return (
    normalized === "" ||
    Object.hasOwn(PlaceholderValues, normalized) ||
    normalized.startsWith("replace-") ||
    normalized.startsWith("your_") ||
    normalized.includes("your_bot_token")
  );
}

export function mergedValues(
  values: ReadonlyMap<string, string>,
  updates: Readonly<Record<string, string>>,
): Map<string, string> {
  return new Map([...values, ...Object.entries(updates)]);
}

export function envRecord(
  values: ReadonlyMap<string, string>,
): Record<string, string> {
  return Object.fromEntries(values);
}

export async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
  capture: boolean,
  input?: string,
): Promise<CommandResult> {
  const proc = Bun.spawn([command, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (!capture) {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  }
  return { code, stdout, stderr };
}
