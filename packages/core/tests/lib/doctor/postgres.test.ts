import { describe, it, expect } from "bun:test";
import { checkPostgres } from "#lib/doctor/checks/postgres.js";

describe("checkPostgres", () => {
  it("fails when SELECT 1 fails", async () => {
    const result = await checkPostgres({
      getClient: () =>
        Promise.resolve({
          $queryRawUnsafe: () => Promise.reject(new Error("connection refused")),
        }),
      migrationsDir: "/nonexistent",
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/SELECT 1/);
  });

  it("ok when there are no local migrations to compare", async () => {
    const result = await checkPostgres({
      getClient: () =>
        Promise.resolve({ $queryRawUnsafe: () => Promise.resolve([{ "?column?": 1 }]) }),
      migrationsDir: "/nonexistent",
      readMigrationNames: () => Promise.resolve([]),
    });
    expect(result.status).toBe("ok");
  });

  it("fails when a local migration has not been applied", async () => {
    const result = await checkPostgres({
      getClient: () =>
        Promise.resolve({
          $queryRawUnsafe: (query: string) =>
            query.includes("_prisma_migrations")
              ? Promise.resolve([
                  { migration_name: "0001_init", finished_at: new Date(), rolled_back_at: null },
                ])
              : Promise.resolve([{ "?column?": 1 }]),
        }),
      migrationsDir: "/fake",
      readMigrationNames: () => Promise.resolve(["0001_init", "0002_add_table"]),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/0002_add_table/);
  });

  it("fails when a migration is marked failed/rolled back", async () => {
    const result = await checkPostgres({
      getClient: () =>
        Promise.resolve({
          $queryRawUnsafe: (query: string) =>
            query.includes("_prisma_migrations")
              ? Promise.resolve([
                  { migration_name: "0001_init", finished_at: null, rolled_back_at: null },
                ])
              : Promise.resolve([{ "?column?": 1 }]),
        }),
      migrationsDir: "/fake",
      readMigrationNames: () => Promise.resolve(["0001_init"]),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/0001_init/);
  });

  it("ok when every local migration is applied", async () => {
    const result = await checkPostgres({
      getClient: () =>
        Promise.resolve({
          $queryRawUnsafe: (query: string) =>
            query.includes("_prisma_migrations")
              ? Promise.resolve([
                  { migration_name: "0001_init", finished_at: new Date(), rolled_back_at: null },
                ])
              : Promise.resolve([{ "?column?": 1 }]),
        }),
      migrationsDir: "/fake",
      readMigrationNames: () => Promise.resolve(["0001_init"]),
    });
    expect(result.status).toBe("ok");
  });
});
