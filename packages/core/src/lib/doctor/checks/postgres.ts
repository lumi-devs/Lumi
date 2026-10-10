import { promises as fs } from "node:fs";
import path from "node:path";
import { runCheck } from "@lumi/lib/doctor/run-check.js";
import type { DoctorCheckResult } from "@lumi/lib/doctor/types.js";

export const PostgresCheckName = "postgres";

interface PrismaMigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export interface PostgresProbeClient {
  $queryRawUnsafe: (query: string) => Promise<unknown>;
}

export interface PostgresCheckDeps {
  /** Override for tests; defaults to the shared `prisma` client. */
  getClient?: () => Promise<PostgresProbeClient>;
  /** Override for tests; defaults to `<cwd>/prisma/migrations`. */
  migrationsDir?: string;
  /** Override for tests; defaults to reading `migrationsDir` off disk. */
  readMigrationNames?: (dir: string) => Promise<string[]>;
}

async function defaultGetClient(): Promise<PostgresProbeClient> {
  const { prisma } = await import("@lumi/lib/prisma/client.js");
  return prisma;
}

async function defaultReadMigrationNames(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name !== "migration_lock.toml" && !name.startsWith("."));
}

export async function checkPostgres(
  deps: PostgresCheckDeps = {},
  timeoutMs = 5_000,
): Promise<DoctorCheckResult> {
  return runCheck(PostgresCheckName, timeoutMs, async () => {
    const migrationsDir =
      deps.migrationsDir ?? path.join(process.cwd(), "prisma", "migrations");
    const readMigrationNames = deps.readMigrationNames ?? defaultReadMigrationNames;

    let client: PostgresProbeClient;
    try {
      client = await (deps.getClient ?? defaultGetClient)();
    } catch (err) {
      return {
        name: PostgresCheckName,
        status: "fail",
        detail: `Failed to construct a Postgres client: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check POSTGRES_URL is set and well-formed.",
      };
    }

    try {
      await client.$queryRawUnsafe("SELECT 1");
    } catch (err) {
      return {
        name: PostgresCheckName,
        status: "fail",
        detail: `SELECT 1 failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check POSTGRES_URL and that the database is reachable.",
      };
    }

    const diskMigrations = await readMigrationNames(migrationsDir);
    if (diskMigrations.length === 0) {
      return {
        name: PostgresCheckName,
        status: "ok",
        detail: "Connected to Postgres (SELECT 1 succeeded). No local migrations to compare against.",
      };
    }

    let rows: PrismaMigrationRow[];
    try {
      rows = (await client.$queryRawUnsafe(
        'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
      )) as PrismaMigrationRow[];
    } catch (err) {
      return {
        name: PostgresCheckName,
        status: "fail",
        detail: `Connected to Postgres, but could not read migration status: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Run `bun run db:migrate` (or `prisma migrate deploy`) to initialize the migrations table.",
      };
    }

    const applied = new Set(
      rows
        .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
        .map((row) => row.migration_name),
    );
    const failed = rows
      .filter((row) => row.finished_at === null || row.rolled_back_at !== null)
      .map((row) => row.migration_name);

    const pending = diskMigrations.filter((name) => !applied.has(name));

    if (failed.length > 0) {
      return {
        name: PostgresCheckName,
        status: "fail",
        detail: `Migration(s) failed or were rolled back: ${failed.join(", ")}.`,
        hint: "Resolve the failed migration (`prisma migrate resolve`) before deploying further changes.",
      };
    }
    if (pending.length > 0) {
      return {
        name: PostgresCheckName,
        status: "fail",
        detail: `Pending migration(s) not yet applied: ${pending.join(", ")}.`,
        hint: "Run `bun run db:migrate` (or `prisma migrate deploy`) to apply them.",
      };
    }
    return {
      name: PostgresCheckName,
      status: "ok",
      detail: `Connected to Postgres; all ${diskMigrations.length} local migration(s) are applied.`,
    };
  });
}
