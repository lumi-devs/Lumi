import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

const packageAliases = readdirSync(resolve(root, "packages")).map((name) => ({
  find: `@lumi/${name}`,
  replacement: resolve(root, "packages", name, "src"),
}));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@lumi/core", replacement: resolve(root, "src/core") },
      { find: "@lumi/admin", replacement: resolve(root, "src/admin") },
      ...packageAliases,
    ],
  },
});
