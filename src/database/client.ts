import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { container } from "@sapphire/framework";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const adapter = new PrismaPg(pool);

export const createPrismaClient = () => {
  const baseClient = new PrismaClient({ adapter });

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          const start = performance.now();
          const result = await query(args);
          const end = performance.now();
          const time = end - start;

          if (time > 1000) {
            container.logger.warn(
              `[Prisma Diagnostic] Query exceeded 1000ms: ${model}.${operation} took ${Math.round(time)}ms`,
            );
          }

          return result;
        },
      },
    },
  });
};

export const prisma = createPrismaClient();

export type EmberPrismaClient = typeof prisma;

export * from "@prisma/client";
