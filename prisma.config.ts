import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: { path: "packages/db/prisma/migrations" },
  datasource: {
    url: process.env["POSTGRES_URL"] ?? "postgresql://lumi:lumi@localhost:5432/lumi",
  },
});
