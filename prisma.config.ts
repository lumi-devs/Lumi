import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {}

const datasourceUrl =
  process.env.DATABASE_URL ??
  process.env.DIRECT_POSTGRES_URL ??
  process.env.POSTGRES_URL ??
  "postgresql://lumi:lumi@127.0.0.1:5432/lumi";

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: {
    path: "packages/db/prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
