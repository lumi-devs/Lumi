# Test Patterns Quick Reference
**Fast lookup guide for Wave 9 test implementation**

---

## Pattern Index

### Command Tests
- [Basic Command Test](#basic-command-test)
- [Permission-Guarded Command](#permission-guarded-command)
- [Command with Options](#command-with-options)
- [Command Error Handling](#command-error-handling)

### RPC Handler Tests
- [RPC GET Operation](#rpc-get-operation)
- [RPC SET Operation](#rpc-set-operation)
- [RPC DELETE Operation](#rpc-delete-operation)
- [RPC Error Response](#rpc-error-response)

### Integration Tests
- [Discord API Error](#discord-api-error)
- [Race Condition](#race-condition)
- [Input Validation](#input-validation)
- [Cache Invalidation](#cache-invalidation)

---

## Command Tests

### Basic Command Test

**When:** Testing a simple command that reads data and returns it (e.g., `ping`, `help`, `about`)

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import { PingCommand } from "#modules/core/commands/ping.js";
import { createMockCommandContext } from "../../fixtures/command-context.js";

describe("PingCommand", () => {
  let command: PingCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    command = new PingCommand(container, { name: "ping" } as any);
  });

  it("should respond with latency", async () => {
    const { ctx } = createMockCommandContext();
    container.client.ws = { ping: 150 } as any; // Mock latency

    await command.run(ctx as any);

    expect(ctx.reply).toHaveBeenCalled();
    const reply = (ctx.reply as any).mock.calls[0][0];
    expect(reply.content).toContain("150ms");
  });
});
```

**Fixtures Used:**
- `createMockCommandContext()` — provides mock guild, member, interaction

---

### Permission-Guarded Command

**When:** Testing commands that require specific permissions (ban, kick, timeout, etc.)

```typescript
import { BanCommand } from "#modules/mod/commands/ban.js";
import { container } from "@sapphire/framework";
import { createMockCommandContext } from "../../fixtures/command-context.js";

describe("BanCommand Permissions", () => {
  let command: BanCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    command = new BanCommand(container, { name: "ban" } as any);
  });

  it("should allow guild owner", async () => {
    const { ctx } = createMockCommandContext({
      userId: "999999999999999999", // Same as guildOwnerId
    });

    await command.run(ctx as any, { target: "user-id" } as any);
    expect(ctx.reply).toHaveBeenCalled();
  });

  it("should deny regular member", async () => {
    const { ctx } = createMockCommandContext({
      guildOwnerId: "owner-id",
      userId: "user-id",
      memberRoles: [], // No special roles
    });

    await command.run(ctx as any, { target: "user-id" } as any);
    expect(ctx.replyError).toHaveBeenCalled();
  });
});
```

**Key Points:**
- Set `userId === guildOwnerId` for owner tests
- Use `memberRoles: []` for non-privileged users
- Use `memberRoles: ["MOD_ROLE"]` for mods
- Verify `ctx.reply` (success) vs `ctx.replyError` (failure)

---

### Command with Options

**When:** Testing commands that accept string/number options (download, repo, config)

```typescript
describe("DownloadCommand", () => {
  it("should search modules by name", async () => {
    const { ctx } = createMockCommandContext();

    // Mock the module store
    container.stores = {
      get: vi.fn().mockReturnValue({
        all: () => [
          { name: "afk", displayName: "AFK", description: "..." },
          { name: "logging", displayName: "Logging", description: "..." },
        ],
      }),
    } as any;

    await command.run(ctx as any, { query: "log" } as any);

    const reply = (ctx.reply as any).mock.calls[0][0];
    expect(reply.content).toContain("logging"); // Filtered by query
  });

  it("should paginate when results exceed limit", async () => {
    const { ctx } = createMockCommandContext();

    container.stores = {
      get: vi.fn().mockReturnValue({
        all: () => Array.from({ length: 50 }, (_, i) => ({
          name: `module${i}`,
        })),
      }),
    } as any;

    await command.run(ctx as any, {});

    const reply = (ctx.reply as any).mock.calls[0][0];
    expect(reply.components).toBeDefined(); // Pagination buttons
  });
});
```

**Key Points:**
- Pass options as second argument to `command.run(ctx, options)`
- Mock container stores/db as needed for lookups
- Check `reply.components` for pagination/buttons
- Verify filtering logic

---

### Command Error Handling

**When:** Testing how commands handle unexpected errors (DB down, Discord API error, etc.)

```typescript
describe("Command Error Handling", () => {
  it("should handle database errors gracefully", async () => {
    const { ctx } = createMockCommandContext();

    // Mock database to throw
    (container as any).db = {
      module: {
        findMany: vi.fn().mockRejectedValue(new Error("Connection lost")),
      },
    };

    await command.run(ctx as any);

    expect(ctx.replyError).toHaveBeenCalled();
    const error = (ctx.replyError as any).mock.calls[0][0];
    expect(error).toContain("error");
  });

  it("should handle missing guild gracefully", async () => {
    const { ctx } = createMockCommandContext({ guildId: undefined });

    await command.run(ctx as any);

    expect(ctx.replyError).toHaveBeenCalled();
  });
});
```

**Key Points:**
- Use `.mockRejectedValue()` to simulate errors
- Verify `ctx.replyError` is called with user-friendly message
- Never expose raw error messages or stack traces

---

## RPC Handler Tests

### RPC GET Operation

**When:** Testing read-only RPC handlers (module.list, config.get, audit.list)

```typescript
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { setupRpcHandler } from "../../fixtures/rpc-handler.js";

describe("RPC GET handlers", () => {
  it("should return guild configuration", async () => {
    const { guild } = await setupRpcHandler();

    (container as any).db.config.findMany = vi.fn().mockResolvedValue([
      { moduleName: "mod", key: "prefix", value: "." },
      { moduleName: "afk", key: "enabled", value: true },
    ]);

    const handler = rpcHandlers[RPC_ACTIONS.guildDashboardGet];
    const result = await handler({
      id: "req-1",
      action: RPC_ACTIONS.guildDashboardGet,
      guildId: guild.id,
    });

    expect(result.ok).toBe(true);
    expect(result.data.config).toHaveLength(2);
  });

  it("should handle missing guild", async () => {
    const { guild } = await setupRpcHandler();

    (container as any).db.guild.findUnique = vi.fn().mockResolvedValue(null);

    const handler = rpcHandlers[RPC_ACTIONS.guildDashboardGet];
    const result = await handler({
      id: "req-1",
      action: RPC_ACTIONS.guildDashboardGet,
      guildId: "nonexistent",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});
```

**Key Points:**
- Use `setupRpcHandler()` to mock Discord client and database
- Mock `container.db.*` methods as needed
- Verify `result.ok` and `result.data` for success
- Verify `result.error` for failures (no stack trace)

---

### RPC SET Operation

**When:** Testing write handlers (config.set, module.toggle, settings.set)

```typescript
describe("RPC SET handlers", () => {
  it("should update configuration and invalidate cache", async () => {
    const { guild } = await setupRpcHandler();

    (container as any).db.config.upsert = vi.fn().mockResolvedValue({
      moduleName: "mod",
      key: "prefix",
      value: "!",
    });

    const handler = rpcHandlers[RPC_ACTIONS.guildConfigSet];
    const result = await handler({
      id: "req-1",
      action: RPC_ACTIONS.guildConfigSet,
      guildId: guild.id,
      data: {
        moduleName: "mod",
        key: "prefix",
        value: "!",
      },
    });

    expect(result.ok).toBe(true);
    // Verify side effects
    expect((container as any).db.config.upsert).toHaveBeenCalled();
    expect((container as any).invalidation.invalidateGuild).toHaveBeenCalledWith(
      guild.id,
      "config:mod",
    );
  });

  it("should validate input before updating", async () => {
    const { guild } = await setupRpcHandler();

    const handler = rpcHandlers[RPC_ACTIONS.guildConfigSet];
    const result = await handler({
      id: "req-1",
      action: RPC_ACTIONS.guildConfigSet,
      guildId: guild.id,
      data: {
        moduleName: "mod",
        key: "max_targets",
        value: -1, // Invalid: must be >= 1
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("validation");
  });
});
```

**Key Points:**
- Mock `container.db.*.upsert()` or `.update()`
- Verify **side effects**: invalidation, logging, emitted events
- Always validate input before update
- Return clear error messages

---

### RPC DELETE Operation

**When:** Testing removal handlers (permits.delete, overrides.remove, etc.)

```typescript
describe("RPC DELETE handlers", () => {
  it("should delete permit and invalidate", async () => {
    const { guild } = await setupRpcHandler();

    (container as any).db.permit.delete = vi
      .fn()
      .mockResolvedValue({ id: 1, name: "deleted-permit" });

    const handler = rpcHandlers[RPC_ACTIONS.guildPermitsDelete];
    const result = await handler({
      id: "req-1",
      action: RPC_ACTIONS.guildPermitsDelete,
      guildId: guild.id,
      data: { permitId: 1 },
    });

    expect(result.ok).toBe(true);
    expect((container as any).db.permit.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    expect((container as any).invalidation.invalidateGuild).toHaveBeenCalledWith(
      guild.id,
      "permits",
    );
  });

  it("should handle missing permit gracefully", async () => {
    const { guild } = await setupRpcHandler();

    (container as any).db.permit.delete = vi
      .fn()
      .mockRejectedValue(new Error("Record not found"));

    const handler = rpcHandlers[RPC_ACTIONS.guildPermitsDelete];
    const result = await handler({
      id: "req-1",
      action: RPC_ACTIONS.guildPermitsDelete,
      guildId: guild.id,
      data: { permitId: 999 },
    });

    expect(result.ok).toBe(false);
  });
});
```

**Key Points:**
- Use `.mockRejectedValue()` for "not found" scenarios
- Always invalidate cache after delete
- Return success even if already deleted (idempotent)

---

### RPC Error Response

**When:** Testing error response structure (matches contracts)

```typescript
describe("RPC Error Responses", () => {
  it("should return structured error response", async () => {
    const { guild } = await setupRpcHandler();

    (container as any).db.guild.findUnique = vi.fn().mockResolvedValue(null);

    const handler = rpcHandlers[RPC_ACTIONS.guildDashboardGet];
    const result = await handler({
      id: "req-1",
      action: RPC_ACTIONS.guildDashboardGet,
      guildId: "missing",
    });

    // Must match RpcResponse contract
    expect(result).toEqual({
      id: "req-1",
      ok: false,
      error: expect.any(String),
    });
    expect(result.data).toBeUndefined(); // No data on error
  });
});
```

**Key Points:**
- Error response must have `{ id, ok: false, error: string }`
- Must **not** include `data` field on error
- Error message must be user-friendly (no stack trace)

---

## Integration Tests

### Discord API Error

**When:** Testing how handlers cope with Discord API failures (404, 403, timeout, rate limit)

```typescript
import { DiscordErrors } from "../../fixtures/discord-errors.js";

describe("Discord API Errors", () => {
  it("should handle guild not found", async () => {
    const { guild } = await setupRpcHandler();

    container.client.guilds.fetch = vi
      .fn()
      .mockRejectedValue(DiscordErrors.guildNotFound(guild.id));

    const result = await someOperation(guild.id);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Guild");
  });

  it("should handle member not found", async () => {
    const { guild } = await setupRpcHandler();

    guild.members.fetch = vi
      .fn()
      .mockRejectedValue(DiscordErrors.memberNotFound("user-id"));

    const result = await someModAction(guild.id, "user-id");

    expect(result.ok).toBe(false);
  });

  it("should handle insufficient permissions", async () => {
    const { guild } = await setupRpcHandler();

    guild.roles.create = vi
      .fn()
      .mockRejectedValue(
        DiscordErrors.insufficientPermissions("create role"),
      );

    const result = await setupOperation(guild.id);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("permission");
  });

  it("should handle rate limit", async () => {
    const { guild } = await setupRpcHandler();

    container.client.guilds.fetch = vi
      .fn()
      .mockRejectedValue(DiscordErrors.rateLimited());

    const result = await someOperation(guild.id);

    expect(result.ok).toBe(false);
    // Caller might want to retry
  });

  it("should handle timeout", async () => {
    const { guild } = await setupRpcHandler();

    container.client.guilds.fetch = vi
      .fn()
      .mockRejectedValue(DiscordErrors.timeout());

    const result = await someOperation(guild.id);

    expect(result.ok).toBe(false);
  });
});
```

**Key Points:**
- Use `DiscordErrors.*` fixture for realistic error objects
- Handler should catch and convert to user-friendly message
- No stack traces in error response
- Different errors may have different retry strategies

---

### Race Condition

**When:** Testing concurrent operations that might collide (duplicate interactions, concurrent updates)

```typescript
describe("Concurrency & Race Conditions", () => {
  it("should be idempotent under duplicate interaction", async () => {
    // Simulate Discord delivering the same interaction twice
    const result1Promise = someOperation({
      guildId: "123",
      userId: "456",
      interactionId: "interaction-1",
    });

    const result2Promise = someOperation({
      guildId: "123",
      userId: "456",
      interactionId: "interaction-1", // Same interaction ID
    });

    const [result1, result2] = await Promise.all([result1Promise, result2Promise]);

    // Both should succeed
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    // Should produce same result (or skip if already processed)
    if (result1.id && result2.id) {
      expect(result1.id).toEqual(result2.id); // Same entity created
    }
  });

  it("should handle concurrent case creation with unique numbers", async () => {
    const cases = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        modRepo.createCase({
          guildId: "123",
          userId: `user-${i}`,
          moderatorId: "mod",
          action: "warn",
          reason: "test",
        }),
      ),
    );

    const caseNumbers = cases.map((c) => c.caseNumber);

    // All unique
    expect(new Set(caseNumbers).size).toBe(10);

    // Mostly sequential (or exactly sequential with proper locking)
    const sorted = [...caseNumbers].sort((a, b) => a - b);
    expect(sorted[0]).toBe(1);
  });

  it("should handle last-write-wins for concurrent config updates", async () => {
    const [update1, update2] = await Promise.all([
      configRepo.set({
        guildId: "123",
        moduleName: "mod",
        key: "prefix",
        value: ".",
      }),
      configRepo.set({
        guildId: "123",
        moduleName: "mod",
        key: "prefix",
        value: "!",
      }),
    ]);

    // Both succeed
    expect(update1.ok).toBe(true);
    expect(update2.ok).toBe(true);

    // One value wins deterministically
    const final = await configRepo.get("123", "mod", "prefix");
    expect([update1.value, update2.value]).toContain(final);
  });
});
```

**Key Points:**
- Use `Promise.all()` for true concurrency
- Test with identical interaction IDs for idempotency
- Verify uniqueness for allocated IDs (case numbers)
- Document which strategy wins (last-write, dedup, retry-with-backoff)

---

### Input Validation

**When:** Testing that invalid input is rejected before reaching business logic

```typescript
describe("Input Validation", () => {
  it("should reject empty module name", () => {
    expect(() => validateModuleName("")).toThrow("Name is required");
  });

  it("should reject oversized input", () => {
    const huge = "x".repeat(100_000);
    expect(() => validateModuleName(huge)).toThrow("Too long");
  });

  it("should reject SQL injection patterns", () => {
    expect(() => validateModuleName("module'; DROP TABLE;--")).toThrow();
  });

  it("should reject negative numbers where unsigned expected", () => {
    expect(() => validateConfigValue("max_targets", -1)).toThrow("Must be >= 1");
  });

  it("should handle unicode edge cases", () => {
    expect(validatePermitName("emoji-🎭")).toBe(true);
    expect(validatePermitName("RTL-אני")).toBe(true);
    expect(validatePermitName("ZWJ-👨‍👩‍👧‍👦")).toBe(true);
  });

  it("should reject invalid snowflakes", () => {
    expect(validateSnowflake("not-a-number")).toBe(false);
    expect(validateSnowflake("")).toBe(false);
    expect(validateSnowflake("-1")).toBe(false);
  });
});
```

**Key Points:**
- Test boundary conditions: empty, huge, min/max values
- Test injection patterns: SQL, NoSQL, shell
- Test special characters: emoji, RTL, ZWJ
- Verify error messages are clear and actionable

---

### Cache Invalidation

**When:** Testing that cache is properly invalidated when data changes

```typescript
describe("Cache Invalidation", () => {
  it("should invalidate guild config cache on update", async () => {
    const { guild } = await setupRpcHandler();

    const updateHandler = rpcHandlers[RPC_ACTIONS.guildConfigSet];
    await updateHandler({
      id: "req-1",
      action: RPC_ACTIONS.guildConfigSet,
      guildId: guild.id,
      data: { moduleName: "mod", key: "prefix", value: "!" },
    });

    // Verify specific keys were invalidated
    expect((container as any).invalidation.invalidateGuild).toHaveBeenCalledWith(
      guild.id,
      "config:mod",
    );
  });

  it("should invalidate all module state on module toggle", async () => {
    const { guild } = await setupRpcHandler();

    const toggleHandler = rpcHandlers[RPC_ACTIONS.guildModuleToggle];
    await toggleHandler({
      id: "req-1",
      action: RPC_ACTIONS.guildModuleToggle,
      guildId: guild.id,
      data: { moduleName: "afk", enabled: false },
    });

    // Invalidate broader cache scope
    expect((container as any).invalidation.invalidateGuild).toHaveBeenCalledWith(
      guild.id,
      "modules",
    );
  });

  it("should not partially update Redis (delete instead)", async () => {
    const { guild } = await setupRpcHandler();

    // Simulate old bad pattern (bad: setex partial data)
    // New pattern: del old key, let lazy-load refill

    const redisDelSpy = vi.spyOn(
      (container as any).redis,
      "del",
    );
    const redisSetSpy = vi.spyOn(
      (container as any).redis,
      "setex",
    );

    await configUpdateOperation(guild.id);

    // Should use DEL, not partial SET
    expect(redisDelSpy).toHaveBeenCalled();
  });
});
```

**Key Points:**
- Verify specific cache keys are invalidated
- Check that invalidation happens **after** database write
- Prefer **delete** over **update** (let lazy-load fill)
- Test TTL semantics if using `setex`

---

## Common Test Utilities

### Before/After Setup

```typescript
import { beforeEach, afterEach, vi } from "vitest";

beforeEach(() => {
  vi.clearAllMocks(); // Reset all mocks
  vi.restoreAllMocks(); // Restore original implementations
});

afterEach(() => {
  // Cleanup if needed
  vi.clearAllTimers();
});
```

### Assertion Helpers

```typescript
// Check for user-friendly error
expect(ctx.replyError).toHaveBeenCalledWith(
  expect.stringMatching(/Permission|Guild|not found/i),
);

// Check for structured response
expect(rpcResult).toMatchObject({
  id: expect.any(String),
  ok: expect.any(Boolean),
});

// Check arrays of objects
expect(results).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: "123", name: "test" }),
  ]),
);
```

### Spy on Specific Methods

```typescript
const dbSpy = vi.spyOn((container as any).db.config, "upsert");

await operation();

expect(dbSpy).toHaveBeenCalledWith(
  expect.objectContaining({ where: { guildId: "123" } }),
);
```

---

## Debugging Tips

- **Run single test:** `bun test path/to/test.ts -t "test name"`
- **Debug output:** Add `console.log()` in test or code
- **Mock spy calls:** `console.log(mockFn.mock.calls)` to see all invocations
- **Check coverage:** `bun test -- --coverage` then view `coverage/index.html`
- **Inspect mock values:** `expect(mockFn.mock.results[0].value)` for return values
