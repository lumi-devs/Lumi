import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { checkDatabase, databaseUrlFrom, envForDatabase } from "./database.ts";
import {
  printDependencyHelp,
  startComposeDeps,
  waitForDependencies,
} from "./dependencies.ts";
import {
  applyDefaults,
  argumentOverrides,
  environmentFallback,
  parseEnv,
  redactUrl,
  upsertEnv,
} from "./env.ts";
import { collectRequired, confirm } from "./prompts.ts";
import { checkRedis, redisUrlFrom } from "./redis.ts";
import {
  mergedValues,
  runCommand,
  type SetupOptions,
  usage,
} from "./shared.ts";

export async function runSetup(options: SetupOptions): Promise<number> {
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (
    !existsSync(join(process.cwd(), "package.json")) ||
    !existsSync(join(process.cwd(), "node_modules"))
  ) {
    process.stderr.write(
      "Run setup from the Lumi repository root after `bun install`.\n",
    );
    return 1;
  }

  const interactive =
    !options.yes &&
    !options.check &&
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true;
  const envPath = join(process.cwd(), ".env");
  const existingContent = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : "";
  const fileValues = parseEnv(existingContent);
  const values = new Map(fileValues);

  const overrideUpdates = argumentOverrides(options);
  for (const [key, value] of Object.entries(overrideUpdates)) {
    values.set(key, value);
  }
  const fallbackUpdates = environmentFallback(values, [
    "BOT_TOKEN",
    "OWNER_IDS",
    "DATABASE_URL",
    "REDIS_URL",
  ]);
  for (const [key, value] of Object.entries(fallbackUpdates)) {
    values.set(key, value);
  }

  const composeAvailable =
    existsSync(join(process.cwd(), "docker-compose.yml")) &&
    Boolean(Bun.which("docker"));
  let useCompose = options.compose ?? composeAvailable;
  if (
    interactive &&
    options.compose === undefined &&
    composeAvailable &&
    !options.skipDeps
  ) {
    useCompose = await confirm(
      "Use Docker Compose for PostgreSQL and Redis?",
      true,
    );
  }

  const updates: Record<string, string> = {
    ...fallbackUpdates,
    ...applyDefaults(values, { compose: useCompose }),
    ...overrideUpdates,
  };

  process.stdout.write("\nLumi setup\n==========\n");

  const issues = await collectRequired(values, updates, interactive);
  if (issues.length > 0) {
    process.stderr.write("\nConfiguration is incomplete:\n");
    for (const issue of issues) {
      process.stderr.write(`  - ${issue.key}: ${issue.message}\n`);
    }
    process.stderr.write(
      "\nRun bun run setup interactively, or pass --token and --owners.\n",
    );
    return 1;
  }

  const effective = mergedValues(values, updates);
  const changed = Object.fromEntries(
    Object.entries(updates).filter(
      ([key, value]) => fileValues.get(key) !== value,
    ),
  );
  const pending = existsSync(envPath) ? changed : updates;

  if (Object.keys(pending).length > 0) {
    process.stdout.write("\nEnvironment changes:\n");
    for (const key of Object.keys(pending)) {
      process.stdout.write(`  - ${key}\n`);
    }
  } else {
    process.stdout.write("\nEnvironment is already up to date.\n");
  }
  process.stdout.write(
    `  Database: ${redactUrl(databaseUrlFrom(effective))}\n`,
  );
  process.stdout.write(`  Redis:    ${redactUrl(redisUrlFrom(effective))}\n`);

  if (options.check) {
    process.stdout.write("\nCheck only; no files were written.\n");
  } else if (Object.keys(pending).length > 0) {
    const content = upsertEnv(existingContent, pending);
    const temporary = `${envPath}.tmp-${process.pid}`;
    writeFileSync(temporary, content, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, envPath);
    process.stdout.write("  Wrote .env (mode 0600).\n");
  }

  if (!options.skipChecks) {
    process.stdout.write("\nChecking connectivity...\n");
    let redisError = await checkRedis(effective);
    let databaseError = await checkDatabase(effective);

    if (
      (redisError || databaseError) &&
      !options.skipDeps &&
      (options.startDeps || (interactive && useCompose))
    ) {
      const start =
        options.startDeps ||
        (await confirm(
          "Could not reach PostgreSQL or Redis. Start them with Docker Compose?",
          true,
        ));
      if (start && (await startComposeDeps(effective))) {
        const result = await waitForDependencies(effective);
        redisError = result.redis;
        databaseError = result.database;
      }
    }

    if (redisError) {
      process.stderr.write(`  Redis: ${redisError}\n`);
    } else {
      process.stdout.write("  Redis: reachable\n");
    }
    if (databaseError) {
      process.stderr.write(`  PostgreSQL: ${databaseError}\n`);
    } else {
      process.stdout.write("  PostgreSQL: reachable\n");
    }

    if (redisError || databaseError) {
      printDependencyHelp();
      return 1;
    }
  }

  if (!options.check) {
    if (!options.skipGenerate) {
      process.stdout.write("\nGenerating the Prisma client...\n");
      const result = await runCommand(
        "bunx",
        ["prisma", "generate"],
        envForDatabase(effective),
        false,
      );
      if (result.code !== 0) {
        process.stderr.write(
          "\nPrisma generate failed. Check DATABASE_URL and rerun setup.\n",
        );
        return 1;
      }
    }

    if (!options.skipMigrate) {
      process.stdout.write("\nApplying database migrations...\n");
      const result = await runCommand(
        "bunx",
        ["prisma", "migrate", "deploy"],
        envForDatabase(effective),
        false,
      );
      if (result.code !== 0) {
        process.stderr.write(
          "\nMigrations failed. Confirm DATABASE_URL points at an empty or existing Lumi database and that the database user can create tables.\n",
        );
        return 1;
      }
    }
  }

  process.stdout.write(`
Setup complete.

Next steps:
  1. Invite the bot with the bot and applications.commands scopes.
  2. Enable the Server Members, Message Content, and Presence intents.
  3. Start the bot:  bun run dev:bot
     Docker:        docker compose up -d bot
  4. In Discord, run /lumi as a server admin to enable modules.
`);
  return 0;
}
