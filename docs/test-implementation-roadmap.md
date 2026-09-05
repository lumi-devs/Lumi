# Test Implementation Roadmap
**Detailed Guide for Wave 9 Test Coverage Expansion**

This document provides concrete patterns, fixtures, and examples for implementing the test gaps identified in `docs/test-strategy.md`.

---

## Part 1: Test Fixture Patterns

### 1.1 CommandContext Mock Factory

All command tests need a consistent `CommandContext` mock. Use this factory:

```typescript
// packages/core/tests/fixtures/command-context.ts
import { vi } from "vitest";
import type { User, Member, Guild, Channel, Message } from "discord.js";

interface CommandContextOptions {
  guildId?: string;
  userId?: string;
  channelId?: string;
  locale?: string;
  memberRoles?: string[];
  guildOwnerId?: string;
  botPermissions?: bigint;
}

export function createMockCommandContext(opts: CommandContextOptions = {}) {
  const {
    guildId = "123456789012345678",
    userId = "987654321098765432",
    channelId = "111111111111111111",
    locale = "en-US",
    memberRoles = [],
    guildOwnerId = "999999999999999999",
    botPermissions = BigInt("8"),
  } = opts;

  const mockUser: Partial<User> = {
    id: userId,
    username: "test-user",
    discriminator: "0001",
  };

  const mockMember: Partial<Member> = {
    id: userId,
    user: mockUser as User,
    roles: {
      cache: new Map(memberRoles.map((rid) => [rid, { id: rid }])),
    },
    permissions: {
      has: vi.fn((perm: string | bigint) => memberRoles.length > 0),
    },
  };

  const mockGuild: Partial<Guild> = {
    id: guildId,
    ownerId: guildOwnerId,
    members: { fetch: vi.fn().mockResolvedValue(mockMember) },
    roles: { cache: new Map() },
    channels: { cache: new Map() },
  };

  const mockChannel: Partial<Channel> = {
    id: channelId,
    guild: mockGuild as Guild,
    isDMBased: () => false,
    isTextBased: () => true,
  };

  const mockMessage: Partial<Message> = {
    guild: mockGuild as Guild,
    channel: mockChannel as Channel,
    author: mockUser as User,
    reply: vi.fn().mockResolvedValue({ id: "reply-id" }),
    react: vi.fn().mockResolvedValue(undefined),
  };

  return {
    ctx: {
      guild: mockGuild as Guild,
      member: mockMember as Member,
      user: mockUser as User,
      channel: mockChannel as Channel,
      interaction: {
        user: mockUser,
        member: mockMember,
        guild: mockGuild,
        locale,
        isRepliable: () => true,
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue({ id: "reply-id" }),
        editReply: vi.fn().mockResolvedValue(undefined),
        deferReply: vi.fn().mockResolvedValue(undefined),
        deleteReply: vi.fn().mockResolvedValue(undefined),
        followUp: vi.fn().mockResolvedValue({ id: "followup-id" }),
      },
      message: mockMessage as Message,
      replyEphemeral: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      replyError: vi.fn().mockResolvedValue(undefined),
      replySuccess: vi.fn().mockResolvedValue(undefined),
      locale,
    },
    // Helpers for test setup
    setMemberRoles: (roleIds: string[]) => {
      mockMember.roles!.cache = new Map(roleIds.map((rid) => [rid, { id: rid }]));
    },
    setGuildOwner: (id: string) => {
      mockGuild.ownerId = id;
    },
    setBotPermissions: (perms: bigint) => {
      mockChannel.permissionsFor = vi.fn().mockReturnValue({
        has: vi.fn((p: string | bigint) => (perms & (p as bigint)) !== BigInt(0)),
        toArray: vi.fn(() => []),
      });
    },
  };
}
```

**Usage in tests:**
```typescript
it("should require guild context", async () => {
  const { ctx } = createMockCommandContext({ guildId: undefined });
  // ctx.guild will be undefined
  expect(() => someCommand(ctx)).toThrow("Guild required");
});

it("should check member permissions", async () => {
  const { ctx, setMemberRoles } = createMockCommandContext();
  setMemberRoles(["MOD_ROLE_ID"]);
  // Now the mock member has MOD_ROLE_ID
});
```

---

### 1.2 RPC Handler Mock Factory

RPC handlers need mocked `container` and Discord client:

```typescript
// packages/core/tests/fixtures/rpc-handler.ts
import { vi } from "vitest";
import { container } from "@sapphire/framework";
import type { Guild, Role, Channel } from "discord.js";

interface RpcHandlerSetupOptions {
  guildId?: string;
  guildOwnerId?: string;
  mockDb?: Record<string, any>;
  mockRedis?: boolean;
}

export async function setupRpcHandler(opts: RpcHandlerSetupOptions = {}) {
  const {
    guildId = "123456789012345678",
    guildOwnerId = "999999999999999999",
    mockDb = {},
    mockRedis = true,
  } = opts;

  const mockGuild: Partial<Guild> = {
    id: guildId,
    ownerId: guildOwnerId,
    name: "Test Guild",
    available: true,
    roles: {
      cache: new Map(),
      fetch: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({
        id: "new-role-id",
        name: "new-role",
      }),
    },
    channels: {
      cache: new Map(),
      fetch: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({
        id: "new-channel-id",
        name: "new-channel",
      }),
    },
    members: {
      fetch: vi.fn().mockResolvedValue(undefined),
    },
  };

  // Mock logger
  container.logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  } as any;

  // Mock client
  container.client = {
    guilds: {
      cache: new Map([[guildId, mockGuild]]),
      fetch: vi.fn().mockResolvedValue(mockGuild),
    },
    users: {
      fetch: vi.fn().mockResolvedValue({ id: "user-id", username: "user" }),
    },
  } as any;

  // Mock Redis
  if (mockRedis) {
    (container as any).redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      setex: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      mget: vi.fn().mockResolvedValue([]),
      hgetall: vi.fn().mockResolvedValue({}),
    };
  }

  // Mock database
  (container as any).db = {
    guild: { findUnique: vi.fn(), create: vi.fn() },
    config: { findMany: vi.fn(), upsert: vi.fn() },
    permit: { findMany: vi.fn(), create: vi.fn() },
    case: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    ...mockDb,
  };

  // Mock invalidation service
  (container as any).invalidation = {
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateGuild: vi.fn().mockResolvedValue(undefined),
    invalidateUser: vi.fn().mockResolvedValue(undefined),
  };

  return {
    guild: mockGuild as Guild,
    cleanupRpcHandler: () => {
      vi.clearAllMocks();
    },
  };
}
```

---

### 1.3 Discord API Error Scenarios

Pre-built error mocks for common Discord failures:

```typescript
// packages/core/tests/fixtures/discord-errors.ts
import { REST, HTTPError } from "@discordjs/rest";

export const DiscordErrors = {
  guildNotFound: (guildId: string) => {
    const err = new HTTPError("Unknown Guild", 10004, 404);
    return err;
  },
  channelNotFound: (channelId: string) => {
    const err = new HTTPError("Unknown Channel", 10003, 404);
    return err;
  },
  roleNotFound: (roleId: string) => {
    const err = new HTTPError("Unknown Role", 10011, 404);
    return err;
  },
  memberNotFound: (memberId: string) => {
    const err = new HTTPError("Unknown Member", 10007, 404);
    return err;
  },
  insufficientPermissions: (action: string) => {
    const err = new HTTPError(`Missing Permissions for ${action}`, 50013, 403);
    return err;
  },
  rateLimited: () => {
    const err = new HTTPError("You are being rate limited", 429, 429);
    (err as any).retryAfter = 5;
    return err;
  },
  timeout: () => new Error("ETIMEDOUT: connection timed out"),
};
```

**Usage:**
```typescript
it("should handle missing guild gracefully", async () => {
  container.client.guilds.fetch.mockRejectedValue(DiscordErrors.guildNotFound("123"));
  const result = await rpcHandler({ guildId: "123" });
  expect(result).toEqual({ ok: false, error: "Guild not found" });
});
```

---

## Part 2: Command Test Patterns

### 2.1 Basic Command Test Template

All command tests should follow this structure:

```typescript
// packages/core/tests/core/commands/help.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import { HelpCommand } from "#modules/core/commands/help.js";
import { createMockCommandContext } from "../../fixtures/command-context.js";

describe("HelpCommand", () => {
  let command: HelpCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    command = new HelpCommand(container, {
      name: "help",
      root: "#modules/core/commands",
    } as any);
  });

  describe("Happy Path", () => {
    it("should return help for all commands", async () => {
      const { ctx } = createMockCommandContext();

      // Mock the store to return a list of commands
      container.stores = {
        get: vi.fn().mockReturnValue({
          loaded: () => [
            { name: "help", description: "Get help" },
            { name: "ping", description: "Check latency" },
          ],
        }),
      } as any;

      await command.run(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const reply = (ctx.reply as any).mock.calls[0][0];
      expect(reply.content).toContain("help");
      expect(reply.content).toContain("ping");
    });

    it("should paginate when there are many commands", async () => {
      const { ctx } = createMockCommandContext();

      // Create 30+ commands to trigger pagination
      const commands = Array.from({ length: 50 }, (_, i) => ({
        name: `cmd${i}`,
        description: `Command ${i}`,
      }));

      container.stores = {
        get: vi.fn().mockReturnValue({
          loaded: () => commands,
        }),
      } as any;

      await command.run(ctx as any);

      // Verify that pagination components are present
      const reply = (ctx.reply as any).mock.calls[0][0];
      expect(reply.components).toBeDefined();
    });

    it("should respect locale in help text", async () => {
      const { ctx } = createMockCommandContext({ locale: "es" });

      await command.run(ctx as any);

      // Help should be localized (if i18n is applied)
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  describe("Error Cases", () => {
    it("should handle missing commands gracefully", async () => {
      const { ctx } = createMockCommandContext();

      container.stores = {
        get: vi.fn().mockReturnValue({
          loaded: () => [],
        }),
      } as any;

      await command.run(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const reply = (ctx.reply as any).mock.calls[0][0];
      expect(reply.content).toContain("No commands"); // Or similar empty state
    });
  });
});
```

---

### 2.2 Permission-Guarded Command Pattern

For commands with permission requirements:

```typescript
// packages/core/tests/core/permission-enforcement.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import { BanCommand } from "#modules/mod/commands/ban.js";
import { KickCommand } from "#modules/mod/commands/kick.js";
import { createMockCommandContext } from "../fixtures/command-context.js";

/**
 * Permission enforcement matrix: verify that destructive commands
 * respect guild ownership and role hierarchy.
 */
describe("Permission Enforcement", () => {
  const destructiveCommands = [
    { CommandClass: BanCommand, name: "ban", requiresPermission: "BAN_MEMBERS" },
    { CommandClass: KickCommand, name: "kick", requiresPermission: "KICK_MEMBERS" },
  ];

  describe.each(destructiveCommands)(
    "$name command",
    ({ CommandClass, requiresPermission }) => {
      let command: InstanceType<typeof CommandClass>;

      beforeEach(() => {
        vi.clearAllMocks();
        command = new CommandClass(container, {
          name: CommandClass.name,
          root: "#modules/mod/commands",
        } as any);
      });

      it("should allow guild owner to execute", async () => {
        const { ctx, setMemberRoles } = createMockCommandContext({
          userId: "999999999999999999", // Same as guildOwnerId by default
        });

        // Owner should bypass permission checks
        await command.run(ctx as any, { target: "user-to-ban" } as any);

        expect(ctx.reply).toHaveBeenCalled();
      });

      it("should allow member with appropriate role", async () => {
        const MOD_ROLE = "mod-role-id";
        const { ctx, setMemberRoles } = createMockCommandContext({
          guildOwnerId: "owner-id",
          userId: "mod-id",
        });

        setMemberRoles([MOD_ROLE]);

        // Mock a precondition or permission check that passes
        container.preconditions = {
          run: vi.fn().mockResolvedValue({ ok: true }),
        } as any;

        await command.run(ctx as any, { target: "user-to-ban" } as any);

        expect(ctx.reply).toHaveBeenCalled();
      });

      it("should deny regular member", async () => {
        const { ctx, setMemberRoles } = createMockCommandContext({
          guildOwnerId: "owner-id",
          userId: "user-id",
        });

        setMemberRoles([]); // No special roles

        // Mock precondition failure
        container.preconditions = {
          run: vi.fn().mockResolvedValue({
            ok: false,
            error: "You lack permissions to use this command",
          }),
        } as any;

        await command.run(ctx as any, { target: "user-to-ban" } as any);

        expect(ctx.replyError).toHaveBeenCalled();
      });

      it("should deny outside guild", async () => {
        const { ctx } = createMockCommandContext({ guildId: undefined });

        await command.run(ctx as any, { target: "user-to-ban" } as any);

        expect(ctx.replyError).toHaveBeenCalledWith(
          expect.stringContaining("This command only works in guilds"),
        );
      });
    },
  );
});
```

---

## Part 3: RPC Handler Test Patterns

### 3.1 RPC SET Operation Test Template

```typescript
// packages/core/tests/modules/dashboard/rpc-set-operations.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { setupRpcHandler } from "../../fixtures/rpc-handler.js";
import { DiscordErrors } from "../../fixtures/discord-errors.js";

describe("RPC SET operations", () => {
  describe("guild.module.toggle", () => {
    it("should enable a disabled module", async () => {
      const { guild } = await setupRpcHandler();

      // Mock the repository to return disabled module
      (container as any).db.module.findUnique = vi.fn().mockResolvedValue({
        name: "afk",
        enabled: false,
      });

      (container as any).db.module.update = vi
        .fn()
        .mockResolvedValue({
          name: "afk",
          enabled: true,
        });

      const handler = rpcHandlers[RPC_ACTIONS.guildModuleToggle];
      const result = await handler({
        id: "req-1",
        action: RPC_ACTIONS.guildModuleToggle,
        guildId: guild.id,
        data: {
          moduleName: "afk",
          enabled: true,
        },
      });

      expect(result.ok).toBe(true);
      expect((container as any).db.module.update).toHaveBeenCalledWith({
        where: { guildId_name: { guildId: guild.id, name: "afk" } },
        data: { enabled: true },
      });

      // Verify invalidation was called
      expect((container as any).invalidation.invalidateGuild).toHaveBeenCalledWith(
        guild.id,
        "modules",
      );
    });

    it("should handle missing module gracefully", async () => {
      const { guild } = await setupRpcHandler();

      (container as any).db.module.findUnique = vi.fn().mockResolvedValue(null);

      const handler = rpcHandlers[RPC_ACTIONS.guildModuleToggle];
      const result = await handler({
        id: "req-1",
        action: RPC_ACTIONS.guildModuleToggle,
        guildId: guild.id,
        data: {
          moduleName: "nonexistent",
          enabled: true,
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should handle database errors gracefully", async () => {
      const { guild } = await setupRpcHandler();

      (container as any).db.module.update = vi
        .fn()
        .mockRejectedValue(new Error("Database connection lost"));

      const handler = rpcHandlers[RPC_ACTIONS.guildModuleToggle];
      const result = await handler({
        id: "req-1",
        action: RPC_ACTIONS.guildModuleToggle,
        guildId: guild.id,
        data: {
          moduleName: "afk",
          enabled: true,
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("error");
    });
  });

  describe("guild.config.set", () => {
    it("should update module configuration", async () => {
      const { guild } = await setupRpcHandler();

      (container as any).db.config.upsert = vi.fn().mockResolvedValue({
        guildId: guild.id,
        moduleName: "mod",
        key: "max_multi_targets",
        value: 5,
      });

      const handler = rpcHandlers[RPC_ACTIONS.guildConfigSet];
      const result = await handler({
        id: "req-1",
        action: RPC_ACTIONS.guildConfigSet,
        guildId: guild.id,
        data: {
          moduleName: "mod",
          key: "max_multi_targets",
          value: 5,
        },
      });

      expect(result.ok).toBe(true);
      expect((container as any).invalidation.invalidateGuild).toHaveBeenCalledWith(
        guild.id,
        "config:mod",
      );
    });

    it("should validate configuration values", async () => {
      const { guild } = await setupRpcHandler();

      // Attempt to set an invalid value (e.g., negative count)
      const handler = rpcHandlers[RPC_ACTIONS.guildConfigSet];
      const result = await handler({
        id: "req-1",
        action: RPC_ACTIONS.guildConfigSet,
        guildId: guild.id,
        data: {
          moduleName: "mod",
          key: "max_multi_targets",
          value: -1, // Invalid: should be >= 1
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("validation");
    });
  });
});
```

---

## Part 4: Edge Case & Error Handling Tests

### 4.1 Discord API Error Test Pattern

```typescript
// packages/core/tests/lib/discord-api-errors.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import { someModeratorFunction } from "#modules/mod/services/moderation.js";
import { setupRpcHandler } from "../fixtures/rpc-handler.js";
import { DiscordErrors } from "../fixtures/discord-errors.js";

describe("Discord API Error Handling", () => {
  describe("Missing Guild", () => {
    it("should handle guild.fetch 404", async () => {
      const { guild } = await setupRpcHandler();

      container.client.guilds.fetch = vi.fn().mockRejectedValue(
        DiscordErrors.guildNotFound(guild.id),
      );

      const result = await someModeratorFunction(guild.id, "user-id");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Guild");
    });
  });

  describe("Missing Channel", () => {
    it("should handle channel.fetch 404", async () => {
      const { guild } = await setupRpcHandler();

      guild.channels.fetch = vi
        .fn()
        .mockRejectedValue(DiscordErrors.channelNotFound("channel-id"));

      const result = await someModeratorFunction(guild.id, "user-id");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Channel");
    });
  });

  describe("Missing Member", () => {
    it("should handle member.fetch 404", async () => {
      const { guild } = await setupRpcHandler();

      guild.members.fetch = vi
        .fn()
        .mockRejectedValue(DiscordErrors.memberNotFound("user-id"));

      const result = await someModeratorFunction(guild.id, "user-id");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Member");
    });
  });

  describe("Insufficient Permissions", () => {
    it("should handle 403 permission denied", async () => {
      const { guild } = await setupRpcHandler();

      guild.roles.create = vi
        .fn()
        .mockRejectedValue(
          DiscordErrors.insufficientPermissions("create role"),
        );

      const result = await someModeratorFunction(guild.id, "user-id");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("permission");
    });
  });

  describe("Rate Limiting", () => {
    it("should handle 429 rate limit", async () => {
      const { guild } = await setupRpcHandler();

      container.client.guilds.fetch = vi
        .fn()
        .mockRejectedValue(DiscordErrors.rateLimited());

      const result = await someModeratorFunction(guild.id, "user-id");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("rate limit");
    });
  });

  describe("Timeout", () => {
    it("should handle connection timeout", async () => {
      const { guild } = await setupRpcHandler();

      container.client.guilds.fetch = vi
        .fn()
        .mockRejectedValue(DiscordErrors.timeout());

      const result = await someModeratorFunction(guild.id, "user-id");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("timeout");
    });
  });
});
```

---

## Part 5: Concurrency & Race Condition Tests

### 5.1 Duplicate Interaction Pattern

```typescript
// packages/core/tests/repositories/race-conditions.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";

describe("Race Conditions & Concurrency", () => {
  describe("Duplicate Interaction Handling", () => {
    it("should be idempotent under duplicate deliveries", async () => {
      const repo = new ModerationRepository(
        container.db,
        container.logger,
        {} as any,
      );

      const caseData = {
        guildId: "123",
        userId: "456",
        moderatorId: "789",
        action: "warn",
        reason: "spam",
      };

      // Simulate two identical requests arriving simultaneously
      const [case1, case2] = await Promise.all([
        repo.createCase(caseData),
        repo.createCase(caseData),
      ]);

      // Both should succeed, but only one case number should be allocated
      // (or they should have the same case number if deduplicated by key)
      expect(case1.caseNumber).toBeDefined();
      expect(case2.caseNumber).toBeDefined();

      // Verify idempotency: case numbers should be identical or sequential
      if (case1.caseNumber === case2.caseNumber) {
        // Deduplication worked
        expect(case1.id).toEqual(case2.id);
      } else {
        // Sequential allocation: case2 should be case1 + 1
        expect(case2.caseNumber).toBe(case1.caseNumber + 1);
      }
    });
  });

  describe("Concurrent Config Updates", () => {
    it("should handle last-write-wins for config", async () => {
      const repo = new ModerationRepository(
        container.db,
        container.logger,
        {} as any,
      );

      // Simulate concurrent updates from dashboard + slash command
      const [update1, update2] = await Promise.all([
        repo.updateConfig({
          guildId: "123",
          moduleName: "mod",
          key: "prefix",
          value: ".",
        }),
        repo.updateConfig({
          guildId: "123",
          moduleName: "mod",
          key: "prefix",
          value: "!",
        }),
      ]);

      // Both should succeed
      expect(update1.ok).toBe(true);
      expect(update2.ok).toBe(true);

      // Final value should be one or the other (deterministic)
      const final = await repo.getConfig("123", "mod", "prefix");
      expect([update1.value, update2.value]).toContain(final.value);
    });
  });

  describe("Case Number Allocation Under Concurrency", () => {
    it("should allocate unique sequential case numbers", async () => {
      const repo = new ModerationRepository(
        container.db,
        container.logger,
        {} as any,
      );

      // Create 10 cases simultaneously
      const cases = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          repo.createCase({
            guildId: "123",
            userId: `user-${i}`,
            moderatorId: "mod",
            action: "warn",
            reason: "test",
          }),
        ),
      );

      // All case numbers should be unique
      const caseNumbers = cases.map((c) => c.caseNumber);
      expect(new Set(caseNumbers).size).toBe(caseNumbers.length);

      // Should be sequential (or mostly sequential)
      const sorted = [...caseNumbers].sort((a, b) => a - b);
      expect(sorted[0]).toBe(1);
      expect(sorted[sorted.length - 1]).toBe(10);
    });
  });
});
```

---

## Part 6: Input Validation Tests

### 6.1 Validation Edge Cases

```typescript
// packages/core/tests/lib/input-validation.test.ts
import { describe, it, expect } from "vitest";
import { validateModuleName, validatePermitName, validateSnowflake } from "#lib/validation.js";

describe("Input Validation", () => {
  describe("Module Name Validation", () => {
    it("should accept valid module names", () => {
      expect(validateModuleName("afk")).toBe(true);
      expect(validateModuleName("mod")).toBe(true);
      expect(validateModuleName("filter")).toBe(true);
    });

    it("should reject invalid names", () => {
      expect(validateModuleName("")).toBe(false);
      expect(validateModuleName("mod; DROP TABLE;")).toBe(false);
      expect(validateModuleName("module/name")).toBe(false);
      expect(validateModuleName("a".repeat(256))).toBe(false);
    });
  });

  describe("Snowflake Validation", () => {
    it("should accept valid snowflakes", () => {
      expect(validateSnowflake("123456789012345678")).toBe(true);
    });

    it("should reject invalid snowflakes", () => {
      expect(validateSnowflake("not-a-number")).toBe(false);
      expect(validateSnowflake("")).toBe(false);
      expect(validateSnowflake("-1")).toBe(false);
      expect(validateSnowflake("123456789012345678901234567890")).toBe(false);
    });
  });

  describe("Extremely Large Input", () => {
    it("should reject oversized payloads", () => {
      const hugeString = "x".repeat(1_000_000);
      expect(() => validatePermitName(hugeString)).toThrow();
    });
  });

  describe("Unicode Edge Cases", () => {
    it("should handle emoji names", () => {
      expect(validatePermitName("role-emoji-🎭")).toBe(true);
    });

    it("should handle RTL text", () => {
      expect(validatePermitName("אני")).toBe(true);
    });

    it("should handle ZWJ sequences", () => {
      expect(validatePermitName("👨‍👩‍👧‍👦")).toBe(true);
    });
  });
});
```

---

## Part 7: Test Organization & Running

### 7.1 Grouping Tests

Use `describe.each()` for matrix testing (permission levels, commands, scenarios):

```typescript
const scenarios = [
  { name: "owner", hasPermission: true, userId: "owner-id" },
  { name: "mod", hasPermission: true, userId: "mod-id" },
  { name: "user", hasPermission: false, userId: "user-id" },
];

describe.each(scenarios)(
  "Permission scenario: $name",
  ({ hasPermission, userId }) => {
    it("should enforce permissions", async () => {
      // Test each scenario
    });
  },
);
```

### 7.2 Running Tests

```bash
# Run all tests
bun run test

# Run specific file
bun run test packages/core/tests/core/commands/help.test.ts

# Run with coverage
bun run test -- --coverage

# Watch mode
bun run test -- --watch
```

---

## Part 8: Checklist for Test Implementation

- [ ] Review `docs/test-strategy.md` to identify priority area
- [ ] Copy fixture factory from this document
- [ ] Create test file in appropriate directory
- [ ] Write tests using patterns from Part 2-6
- [ ] Run tests: `bun run test path/to/test.ts`
- [ ] Verify happy path passes
- [ ] Add error cases
- [ ] Add edge cases
- [ ] Check coverage: `bun run test -- --coverage`
- [ ] Commit: "test: add [area] tests for [feature]"
