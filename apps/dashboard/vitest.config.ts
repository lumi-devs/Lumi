import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate config from the root vitest.config.ts (which only globs
// `packages/**` and runs a "node" environment) — same pattern this repo
// already uses for vitest.e2e.config.ts. Kept as its own file/command
// rather than folded into the root config for two reasons:
//  1. React component tests need a DOM (`jsdom`); the bot/worker suite
//     doesn't and shouldn't pay that cost.
//  2. This package's `#/*` import alias is a TypeScript-only `tsconfig`
//     "paths" entry (resolved by Next's bundler + tsc), not a Node/Bun
//     `package.json#imports` subpath map like the rest of the monorepo's
//     `#lib/*`, `#utilities/*`, etc. Registering a bare `"#"` alias in the
//     *shared* root config would prefix-match and hijack those unrelated
//     `#lib/*`-style specifiers used by packages/core's tests. Scoping the
//     alias to this package's own config avoids that collision entirely.
export default defineConfig({
  resolve: {
    alias: {
      "#": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Vite 8 defaults to the oxc transformer (not esbuild) and reads the
  // nearest tsconfig.json's `compilerOptions.jsx` to drive it.
  // apps/dashboard/tsconfig.json sets `"jsx": "preserve"` (required so
  // Next's own compiler handles JSX during `next build`/`next dev`), which
  // left raw JSX untransformed under Vitest and broke import analysis.
  // Force the normal React 19 automatic-runtime transform for tests.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      reporter: ["text", "json", "html", "lcov"],
    },
  },
});
