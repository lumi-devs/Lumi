import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

const workspaceAliases = ["packages", "modules"].flatMap((parent) =>
  readdirSync(resolve(root, parent))
    .map((name) => ({
      find: `@lumi/${name}`,
      replacement: resolve(root, parent, name, "src"),
    }))
    .filter((alias) => existsSync(alias.replacement)),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@lumi/core",
        replacement: resolve(root, "apps/bot/src/core/src"),
      },
      {
        find: "@lumi/admin",
        replacement: resolve(root, "apps/bot/src/admin/src"),
      },
      {
        find: "@lumi/security",
        replacement: resolve(root, "apps/bot/src/security/src"),
      },
      {
        find: "@prisma/client",
        replacement: resolve(root, "packages/prisma-client/src"),
      },
      ...workspaceAliases,
    ],
  },
});
