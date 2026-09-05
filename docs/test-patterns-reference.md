# Test Patterns Quick Reference

Copy-paste patterns taken from tests that actually run in this repo. Every
snippet below matches a real file under `packages/core/tests/`; if a pattern
here stops compiling, the test suite it came from is the source of truth.

---

## Running the suite

The runner is **vitest**, not Bun's built-in runner. `bun test` will load the
files but not the vitest globals, and fails with `importOriginal is not a
function`.

```sh
nix develop -c bunx vitest run                       # packages/*
nix develop -c bunx vitest run path/to/file.test.ts  # one file
nix develop -c bunx vitest run -t "test name"        # one test
nix develop -c bun run --cwd apps/dashboard test     # dashboard suite
```

`bun`, `node` and `gh` are not on `PATH` outside the Nix devshell, so every
command needs the `nix develop -c` prefix.

---

## Pattern Index

- [Command Tests](#command-tests)
- [RPC Handler Tests](#rpc-handler-tests)
- [Prisma Mocking](#prisma-mocking)
- [Common Test Utilities](#common-test-utilities)

---

## Command Tests

There is no shared command-context fixture. Each command test builds the
container services it needs and a plain object standing in for `CommandContext`.
See `packages/core/tests/core/commands/lumi.test.ts`.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { LumiCommand } from "#modules/core/commands/lumi.js";

describe("LumiCommand", () => {
  let command: LumiCommand;

  beforeEach(() => {
    vi.clearAllMocks();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).db = {
      config: {
        getGuildSettings: vi
          .fn()
          .mockResolvedValue({ prefix: "!", locale: "en-US" }),
      },
    };

    command = new LumiCommand(
      {
        name: "lumi",
        path: "/path/to/commands/lumi.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      },
      { prefixEnabled: true },
    );
  });

  function createMockCtx() {
    return {
      isSlash: false,
      guildId: "g-1",
      user: { id: "u-1", tag: "Tester#0001" },
      source: {},
      fetchT: vi.fn().mockResolvedValue((key: string) => key),
      reply: vi.fn().mockResolvedValue(undefined),
      replyError: vi.fn().mockResolvedValue(undefined),
      replySuccess: vi.fn().mockResolvedValue(undefined),
    } as any;
  }

  it("replies with a card", async () => {
    const ctx = createMockCtx();
    await command.someSubcommand(ctx);
    expect(ctx.reply).toHaveBeenCalled();
  });
});
```

**Notes**

- Stub only the container services the code path under test reaches. Anything
  it touches that you leave undefined fails as `Cannot read properties of
  undefined`, which points straight at the missing stub.
- `fetchT` returns the key unchanged so assertions read against i18n keys
  rather than translated copy.
- Mock collaborating modules with `vi.mock(...)` at the top of the file, before
  importing them — see the `config-panel` / `self-update` mocks in
  `lumi.test.ts`.

---

## RPC Handler Tests

`rpcHandlers` is a **`Map`**, so handlers are read with `.get(action)`, not
index access. A handler **returns its payload directly and throws on failure**
— the `{ id, ok, error }` envelope is built by `dispatchRpc`, one layer above.
Asserting `result.ok` against a handler's return value therefore never
succeeds. See `packages/core/tests/modules/dashboard/audit-history-rpc.test.ts`.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RpcActions } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GuildId = "123456789012345678";
const OwnerId = "111111111111111111";

describe("guild.audit.list", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = createMockPrismaClient();
    guild = { id: GuildId, ownerId: OwnerId, members: { fetch: vi.fn() } };

    // ...wire container.logger / db / client here...

    // Handlers register in the module's onLoad, so it has to run first.
    const mod = new DashboardModule({} as any, { name: "dashboard" });
    await mod.onLoad();
  });

  const handlerFor = (action: string) => {
    const handler = rpcHandlers.get(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: string, data?: unknown, actorId = OwnerId) =>
    handlerFor(action)({ id: "req", action, guildId: GuildId, actorId, data });

  it("returns newest-first entries with a total", async () => {
    prisma.$seed("auditLedger", [
      { id: 1, guildId: GuildId, createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: 2, guildId: GuildId, createdAt: new Date("2026-01-02T00:00:00Z") },
    ]);

    const res = (await call(RpcActions.guildAuditList, {})) as any;

    expect(res.total).toBe(2);
    expect(res.entries.map((e: any) => e.id)).toEqual([2, 1]);
  });

  it("rejects a malformed payload", async () => {
    await expect(
      call(RpcActions.guildAuditList, { platform: "carrier-pigeon" }),
    ).rejects.toThrow("Bad payload");
  });

  it("rejects an actor without ManageGuild", async () => {
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

    await expect(call(RpcActions.guildAuditList, {})).rejects.toThrow();
  });
});
```

**Notes**

- Failure assertions are `await expect(call(...)).rejects.toThrow(...)`.
- Register handlers by constructing the owning module and awaiting `onLoad()`;
  importing the module file alone does not populate the map.
- To exercise the envelope (`ok`, `error`, the dashboard-enabled gate), call
  `dispatchRpc` instead of the handler — that is the layer that produces it.

---

## Prisma Mocking

`packages/core/tests/mocks/prisma.ts` exports `createMockPrismaClient()`, an
in-memory stand-in with a `$seed(model, rows)` helper. It is the only shared
fixture in the suite. Its own behaviour is covered by
`packages/core/tests/mocks/prisma.test.ts`.

```typescript
const prisma = createMockPrismaClient();
prisma.$seed("auditLedger", [{ id: 1, guildId: GuildId }]);
```

For anything it does not model, stub the repository method directly:

```typescript
(container as any).db.config.getGuildSettings = vi
  .fn()
  .mockResolvedValue({ prefix: "!", locale: "en-US" });
```

---

## Common Test Utilities

### Setup

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

`vi.restoreAllMocks()` also undoes `vi.mock` factories declared at module
scope, so prefer `clearAllMocks` unless a test used `vi.spyOn`.

### Assertions

```typescript
expect(ctx.replyError).toHaveBeenCalledWith(
  expect.stringMatching(/Permission|Guild|not found/i),
);

expect(results).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: "123", name: "test" }),
  ]),
);
```

### Spying

```typescript
const spy = vi.spyOn((container as any).db.config, "setConfig");

await operation();

expect(spy).toHaveBeenCalledWith(
  expect.objectContaining({ guildId: GuildId }),
);
```

---

## Debugging Tips

- **Single test:** `nix develop -c bunx vitest run -t "test name"`
- **See every call:** `console.log(mockFn.mock.calls)`
- **Return values:** `mockFn.mock.results[0].value`
- **Coverage:** `nix develop -c bunx vitest run --coverage`
- **`Cannot read properties of undefined`** in a container service almost
  always means a stub is missing from `beforeEach`, not a bug in the code
  under test.
