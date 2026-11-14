import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {}

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL is not set.");
}

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: {
    path: "packages/db/prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
