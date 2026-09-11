// happy-dom is registered by tests/happydom-register.ts, a SEPARATE preload
// file that must finish running before this one starts (see bunfig.toml's
// `preload` array order). It can't be done here: ES module static imports
// all resolve before any of a module's own top-level code runs, so the
// `@testing-library/react` import below would still load — and its `screen`
// singleton would still permanently bind to a missing `document` — before a
// register() call placed in this same file ever executed.
import { afterEach, expect, vi } from "bun:test";
import { cleanup } from "@testing-library/react";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";

expect.extend(jestDomMatchers);

// `server-only`'s real package throws unconditionally unless resolved under
// the `"react-server"` package.json export condition (which Next's bundler
// sets, but plain Node/Vitest doesn't) — see node_modules/server-only for
// the throw. Every server-side module in this app (`lib/env.ts`,
// `lib/auth.ts`, `lib/auth-guards.ts`, `lib/rpc.ts`, `lib/discord.ts`, ...)
// starts with `import "server-only"`, so this is a blanket mock rather than
// something each test file should have to repeat.
vi.mock("server-only", () => ({}));

// Unlike vitest's per-file `vi.mock`, bun:test's `mock.module` replaces a
// module's exports process-wide — whichever test file mocks
// "#/actions/guild-actions" last wins, and any export that file's factory
// didn't include stops existing for every other file that imports it. So
// there's exactly one registration for this module, here, covering every
// export `guild-actions.ts` has; each test file imports these same mock
// functions and configures per-test behavior with `.mockResolvedValue(...)`
// etc. instead of declaring its own (necessarily partial) `vi.mock` factory.
export const guildActionsMock = {
  toggleGuildModule: vi.fn(),
  setGuildConfigField: vi.fn(),
  setManyGuildConfigFields: vi.fn(),
  runGuildSetup: vi.fn(),
  setGuildSettings: vi.fn(),
  createPermit: vi.fn(),
  updatePermit: vi.fn(),
  deletePermit: vi.fn(),
  assignPermit: vi.fn(),
  unassignPermit: vi.fn(),
};

vi.mock("#/actions/guild-actions", () => guildActionsMock);

// Same process-wide-replacement hazard as above, for `next/navigation`: one
// file mocking only `{ redirect, notFound }` would strip `useRouter` (and
// everything else) from it for every other file. Spread the real module
// once, here, and override what needs overriding.
const realNextNavigation = await import("next/navigation");
export const nextNavigationMock = {
  ...realNextNavigation,
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
};

vi.mock("next/navigation", () => nextNavigationMock);

// Same hazard, for `#/lib/auth`: it exports `{ handlers, auth, signIn,
// signOut }` and a narrower per-file mock would strip whichever of those it
// didn't list for every other file that imports this module.
export const authMock = {
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
};

vi.mock("#/lib/auth", () => authMock);

// RTL doesn't auto-register cleanup on its own, so it's wired explicitly here.
afterEach(() => {
  cleanup();
});

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly scrollMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

class MockResizeObserver implements ResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

if (typeof window !== "undefined") {
  window.IntersectionObserver ??= MockIntersectionObserver;
  window.ResizeObserver ??= MockResizeObserver;
}
