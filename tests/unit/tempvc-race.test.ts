import { describe, expect, it, vi } from "vitest";
import { ChannelType } from "discord.js";
import {
  TempVcConfigSchema,
  createTempVoiceChannel,
} from "../../modules/tempvc/src/panel.js";

const makeChannel = (
  guild: any,
  id: string,
  name: string,
  channels: Map<string, any>,
  userLimit = 0,
) => {
  const channel: any = {
    id,
    name,
    type: ChannelType.GuildVoice,
    guild,
    members: new Map(),
    userLimit,
    permissionOverwrites: {
      cache: new Map([
        ["everyone", { allow: new Set(), deny: new Set() }],
      ]),
      edit: vi.fn(async () => undefined),
    },
    send: vi.fn(async () => undefined),
    delete: vi.fn(async () => {
      channels.delete(id);
      return channel;
    }),
  };
  channels.set(id, channel);
  return channel;
};

const makeFixture = (guildId: string, userId: string) => {
  const rows = new Map<string, any>();
  const channels = new Map<string, any>();
  let nextChannelId = 1;
  let guild: any;

  const create = vi.fn(async (options: any) => {
    const channel = makeChannel(
      guild,
      `channel-${nextChannelId++}`,
      options.name,
      channels,
      options.userLimit ?? 0,
    );
    return channel;
  });
  const fetch = vi.fn(async (channelId: string) => {
    return channels.get(channelId) ?? null;
  });

  guild = {
    id: guildId,
    roles: { everyone: { id: "everyone" } },
    channels: { cache: channels, create, fetch },
  };

  const tempVcChannel = {
    findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
      let values = [...rows.values()].filter(
        (row) =>
          (!where?.guildId || row.guildId === where.guildId) &&
          (!where?.ownerId || row.ownerId === where.ownerId),
      );
      if (orderBy?.createdAt === "desc") {
        values = values.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }
      return values;
    }),
    findUnique: vi.fn(async ({ where }: any) => rows.get(where.channelId) ?? null),
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        [...rows.values()].find(
          (row) =>
            (!where?.guildId || row.guildId === where.guildId) &&
            (!where?.ownerId || row.ownerId === where.ownerId),
        ) ?? null
      );
    }),
    count: vi.fn(async ({ where }: any = {}) => {
      return [...rows.values()].filter(
        (row) =>
          (!where?.guildId || row.guildId === where.guildId) &&
          (!where?.ownerId || row.ownerId === where.ownerId),
      ).length;
    }),
    create: vi.fn(async ({ data }: any) => {
      const row = { ...data, createdAt: new Date() };
      rows.set(row.channelId, row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = rows.get(where.channelId);
      if (!row) throw new Error("missing row");
      Object.assign(row, data);
      return row;
    }),
    delete: vi.fn(async ({ where }: any) => {
      const row = rows.get(where.channelId);
      rows.delete(where.channelId);
      return row;
    }),
  };

  const redisKeys = new Map<string, number>();
  const redis = {
    set: vi.fn(
      async (
        key: string,
        _value: string,
        _mode: string,
        ttlMs: number,
        nx?: string,
      ) => {
        if (nx === "NX" && redisKeys.has(key)) return null;
        redisKeys.set(key, Date.now() + ttlMs);
        return "OK";
      },
    ),
    del: vi.fn(async (key: string) => {
      return redisKeys.delete(key) ? 1 : 0;
    }),
    pttl: vi.fn(async (key: string) => {
      const until = redisKeys.get(key);
      return until === undefined ? -2 : Math.max(0, until - Date.now());
    }),
  };

  const setChannel = vi.fn(async (_channel: any) => undefined);
  const disconnect = vi.fn(async () => undefined);
  const send = vi.fn(async (_card: any) => undefined);
  const member = {
    id: userId,
    displayName: "Tester",
    user: { bot: false },
    voice: { setChannel, disconnect },
    send,
  };

  const services = {
    client: {
      guilds: {
        cache: new Map([[guildId, guild]]),
      },
    },
    db: { prisma: { tempVcChannel } },
    redis,
    modules: { isEnabled: () => true },
  };

  return {
    guildId,
    userId,
    rows,
    channels,
    redisKeys,
    redis,
    tempVcChannel,
    services,
    member,
    setChannel,
    disconnect,
    send,
    create,
    fetch,
    guild,
  };
};

describe("tempvc creation race handling", () => {
  it("defaults the creation cooldown to 10 seconds", () => {
    expect(TempVcConfigSchema.parse({}).createCooldownMs).toBe(10000);
  });

  it("moves the member back to their existing owned channel", async () => {
    const fixture = makeFixture("guild-existing", "user-existing");
    const existing = makeChannel(
      fixture.guild,
      "existing-channel",
      "Tester's Channel",
      fixture.channels,
    );
    fixture.rows.set(existing.id, {
      guildId: fixture.guildId,
      channelId: existing.id,
      ownerId: fixture.userId,
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });

    const result = await createTempVoiceChannel(
      fixture.services as any,
      fixture.guildId,
      fixture.member as any,
      TempVcConfigSchema.parse({}),
    );

    expect(result).toBe(existing);
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.setChannel).toHaveBeenCalledWith(existing);
    expect(fixture.rows.get(existing.id)?.expiresAt).toBeNull();
  });

  it("deletes the new channel when the member leaves before the move", async () => {
    const fixture = makeFixture("guild-orphan", "user-orphan");
    fixture.setChannel.mockRejectedValueOnce(new Error("member left"));

    const result = await createTempVoiceChannel(
      fixture.services as any,
      fixture.guildId,
      fixture.member as any,
      TempVcConfigSchema.parse({}),
    );

    expect(result).toBeNull();
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.channels.size).toBe(0);
    expect(fixture.rows.size).toBe(0);
    expect(fixture.redis.del).not.toHaveBeenCalled();
    expect(
      fixture.redisKeys.has(
        `lumi:tempvc:create:${fixture.guildId}:${fixture.userId}`,
      ),
    ).toBe(true);
  });

  it("creates only one channel for concurrent generator joins", async () => {
    const fixture = makeFixture("guild-race", "user-race");

    const [first, second] = await Promise.all([
      createTempVoiceChannel(
        fixture.services as any,
        fixture.guildId,
        fixture.member as any,
        TempVcConfigSchema.parse({}),
      ),
      createTempVoiceChannel(
        fixture.services as any,
        fixture.guildId,
        fixture.member as any,
        TempVcConfigSchema.parse({}),
      ),
    ]);

    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.channels.size).toBe(1);
    expect(fixture.setChannel).toHaveBeenCalledTimes(1);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("honors a configured cooldown and blocks rapid recreation", async () => {
    const fixture = makeFixture("guild-cooldown", "user-cooldown");
    const config = TempVcConfigSchema.parse({ createCooldownMs: 2500 });
    fixture.redisKeys.set(
      `lumi:tempvc:create:${fixture.guildId}:${fixture.userId}`,
      Date.now() + 2500,
    );

    const result = await createTempVoiceChannel(
      fixture.services as any,
      fixture.guildId,
      fixture.member as any,
      config,
    );

    expect(result).toBeNull();
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.redis.set).toHaveBeenCalledWith(
      `lumi:tempvc:create:${fixture.guildId}:${fixture.userId}`,
      "1",
      "PX",
      2500,
      "NX",
    );
    expect(fixture.disconnect).toHaveBeenCalledTimes(1);
    expect(fixture.send).toHaveBeenCalledTimes(1);
    const card = JSON.stringify(fixture.send.mock.calls[0]![0]);
    expect(card).toContain("Slow Down");
    expect(card).toContain("Try again in 3s.");
  });

  it("removes a stale database row when its channel no longer exists", async () => {
    const fixture = makeFixture("guild-stale", "user-stale");
    fixture.rows.set("stale-channel", {
      guildId: fixture.guildId,
      channelId: "stale-channel",
      ownerId: fixture.userId,
      expiresAt: null,
      createdAt: new Date(),
    });

    const result = await createTempVoiceChannel(
      fixture.services as any,
      fixture.guildId,
      fixture.member as any,
      TempVcConfigSchema.parse({}),
    );

    expect(result).not.toBeNull();
    expect(fixture.rows.has("stale-channel")).toBe(false);
    expect(fixture.rows.has(result!.id)).toBe(true);
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });
});
