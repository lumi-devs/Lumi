import { SlashCommandBuilder } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleInteraction } from "../../src/core/dispatch.ts";
import { CommandRegistry } from "../../src/core/modules.ts";

const OriginalOwnerIds = process.env.OWNER_IDS;

afterEach(() => {
  if (OriginalOwnerIds === undefined) {
    delete process.env.OWNER_IDS;
  } else {
    process.env.OWNER_IDS = OriginalOwnerIds;
  }
});

function autocompleteInteraction(hasManageGuild: boolean) {
  return {
    user: { id: "user" },
    guildId: "guild",
    guild: { ownerId: "owner" },
    member: { roles: { cache: new Map() } },
    memberPermissions: { has: () => hasManageGuild },
    client: {},
    commandName: "config",
    isAutocomplete: () => true,
    isChatInputCommand: () => false,
    isRepliable: () => true,
    respond: vi.fn(async () => undefined),
  };
}

function context(autocomplete: () => Promise<void>) {
  const registry = new CommandRegistry();
  registry.add({
    requiresAdmin: true,
    module: null,
    data: new SlashCommandBuilder()
      .setName("config")
      .setDescription("Open a module's configuration"),
    autocomplete,
    execute: async () => undefined,
  });

  const prisma = {
    userBlacklist: { findUnique: async () => null },
    guildBlacklist: { findUnique: async () => null },
  };
  const cache = {
    async getOrLoad<T>(
      _key: string,
      _ttlMs: number,
      loader: () => Promise<T | null | undefined>,
    ): Promise<T | null> {
      return (await loader()) ?? null;
    },
  };

  return {
    client: {},
    registry,
    moduleLoader: { isActive: () => true },
    services: {
      prisma,
      configService: { get: async () => false },
      permits: { explainPermit: async () => ({ allowed: false, rows: [] }) },
      helpers: { cache },
    } as never,
    logger: { error: vi.fn() },
    errorStore: { record: vi.fn(async () => ({ id: "trace" })) },
    createPermitPanel: vi.fn(),
  };
}

describe("autocomplete authorization", () => {
  it("does not run an admin command's autocomplete for non-admins", async () => {
    process.env.OWNER_IDS = "someone-else";
    const autocomplete = vi.fn(async () => undefined);
    const interaction = autocompleteInteraction(false);

    await handleInteraction(
      interaction as never,
      context(autocomplete) as never,
    );

    expect(autocomplete).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it("runs an admin command's autocomplete for admins", async () => {
    process.env.OWNER_IDS = "someone-else";
    const autocomplete = vi.fn(async () => undefined);
    const interaction = autocompleteInteraction(true);

    await handleInteraction(
      interaction as never,
      context(autocomplete) as never,
    );

    expect(autocomplete).toHaveBeenCalledTimes(1);
    expect(interaction.respond).not.toHaveBeenCalled();
  });
});
