import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// `server-only`'s real package throws unconditionally unless resolved under
// the `"react-server"` package.json export condition (which Next's bundler
// sets, but plain Node/Vitest doesn't) — see node_modules/server-only for
// the throw. Every server-side module in this app (`lib/env.ts`,
// `lib/auth.ts`, `lib/auth-guards.ts`, `lib/rpc.ts`, `lib/discord.ts`, ...)
// starts with `import "server-only"`, so this is a blanket mock rather than
// something each test file should have to repeat.
vi.mock("server-only", () => ({}));

// RTL doesn't auto-register cleanup unless the test runner exposes it as a
// global (we don't set `test.globals: true` in vitest.config.ts, matching
// the root config's style), so it's wired explicitly here.
afterEach(() => {
  cleanup();
});
