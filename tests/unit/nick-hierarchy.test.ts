import { describe, expect, it } from "vitest";
import { canChangeNickname } from "../../modules/utility/nick/hierarchy.ts";
import nickModule from "../../modules/utility/nick/index.ts";

const nickCommand = nickModule.commands.find(
  (command) => command.data.name === "nick",
)!;

function member(
  id: string,
  roleIds: string[],
  options: { manageable?: boolean; changes?: Array<string | null> } = {},
) {
  return {
    id,
    manageable: options.manageable ?? true,
    roles: { cache: new Map(roleIds.map((roleId) => [roleId, {}])) },
    setNickname: async (value: string | null) => {
      options.changes?.push(value);
    },
  };
}

function makeGuild(members: Record<string, any>, botId = "bot") {
  return {
    id: "guild",
    ownerId: "owner",
    roles: {
      cache: new Map([
        ["role-low", { position: 1 }],
        ["role-high", { position: 5 }],
      ]),
    },
    members: {
      me: {
        id: botId,
        permissions: { has: () => true },
      },
      fetch: async (id: string) => members[id] ?? null,
    },
  };
}

function makeInteraction(options: {
  guild: any;
  userId: string;
  member: any;
  targetUser?: { id: string } | null;
  nickname?: string | null;
}) {
  const replies: any[] = [];
  return {
    replies,
    interaction: {
      guild: options.guild,
      guildId: "guild",
      channelId: "channel",
      user: { id: options.userId, tag: "Actor#0001" },
      member: options.member,
      options: {
        getUser: () => options.targetUser ?? null,
        getString: () => options.nickname ?? null,
      },
      reply: async (card: any) => {
        replies.push(card);
      },
    },
  };
}

function services(
  options: {
    permitAllowed?: boolean;
    config?: Record<string, unknown>;
  } = {},
) {
  return {
    client: {},
    config: {
      get: async () => options.config ?? {},
    },
    permits: {
      explainPermit: async () => ({ allowed: options.permitAllowed ?? true }),
    },
  };
}

describe("canChangeNickname", () => {
  it("allows a higher role to change a lower role", () => {
    expect(
      canChangeNickname({
        actorTopRolePosition: 5,
        targetTopRolePosition: 1,
      }),
    ).toEqual({ allowed: true });
  });

  it("denies equal and lower roles", () => {
    expect(
      canChangeNickname({
        actorTopRolePosition: 5,
        targetTopRolePosition: 5,
      }).allowed,
    ).toBe(false);
    expect(
      canChangeNickname({
        actorTopRolePosition: 1,
        targetTopRolePosition: 5,
      }).allowed,
    ).toBe(false);
  });

  it("lets the guild owner change anyone but not the owner themselves", () => {
    expect(
      canChangeNickname({
        actorTopRolePosition: 0,
        targetTopRolePosition: 5,
        actorIsGuildOwner: true,
      }).allowed,
    ).toBe(true);
    expect(
      canChangeNickname({
        actorTopRolePosition: 5,
        targetTopRolePosition: 0,
        targetIsGuildOwner: true,
      }).allowed,
    ).toBe(false);
  });
});

describe("nick command", () => {
  it("requires the mod.nick permit", async () => {
    const actorChanges: Array<string | null> = [];
    const targetChanges: Array<string | null> = [];
    const actor = member("actor", ["role-high"], { changes: actorChanges });
    const target = member("target", ["role-low"], { changes: targetChanges });
    const { interaction, replies } = makeInteraction({
      guild: makeGuild({ actor, target }),
      userId: "actor",
      member: actor,
      targetUser: { id: "target" },
      nickname: "New",
    });

    await nickCommand.execute(
      interaction as any,
      services({ permitAllowed: false }) as any,
    );

    expect(replies).toHaveLength(1);
    expect(targetChanges).toEqual([]);
  });

  it("denies self changes when the setting is off", async () => {
    const changes: Array<string | null> = [];
    const actor = member("actor", ["role-high"], { changes });
    const { interaction, replies } = makeInteraction({
      guild: makeGuild({ actor }),
      userId: "actor",
      member: actor,
      nickname: "New",
    });

    await nickCommand.execute(interaction as any, services() as any);

    expect(replies).toHaveLength(1);
    expect(changes).toEqual([]);
  });

  it("allows self changes when the setting is on", async () => {
    const changes: Array<string | null> = [];
    const actor = member("actor", ["role-high"], { changes });
    const { interaction, replies } = makeInteraction({
      guild: makeGuild({ actor }),
      userId: "actor",
      member: actor,
      nickname: "New",
    });

    await nickCommand.execute(
      interaction as any,
      services({ config: { allowSelfNick: true } }) as any,
    );

    expect(replies).toHaveLength(1);
    expect(changes).toEqual(["New"]);
  });

  it("blocks changing a member with an equal or higher role", async () => {
    const changes: Array<string | null> = [];
    const actor = member("actor", ["role-low"]);
    const target = member("target", ["role-high"], { changes });
    const { interaction, replies } = makeInteraction({
      guild: makeGuild({ actor, target }),
      userId: "actor",
      member: actor,
      targetUser: { id: "target" },
      nickname: "New",
    });

    await nickCommand.execute(interaction as any, services() as any);

    expect(replies).toHaveLength(1);
    expect(changes).toEqual([]);
  });

  it("allows changing a lower-ranked member", async () => {
    const changes: Array<string | null> = [];
    const actor = member("actor", ["role-high"]);
    const target = member("target", ["role-low"], { changes });
    const { interaction, replies } = makeInteraction({
      guild: makeGuild({ actor, target }),
      userId: "actor",
      member: actor,
      targetUser: { id: "target" },
      nickname: "New",
    });

    await nickCommand.execute(interaction as any, services() as any);

    expect(replies).toHaveLength(1);
    expect(changes).toEqual(["New"]);
  });

  it("blocks changing the server owner", async () => {
    const changes: Array<string | null> = [];
    const actor = member("actor", ["role-high"]);
    const owner = member("owner", ["role-high"], { changes });
    const { interaction, replies } = makeInteraction({
      guild: makeGuild({ actor, owner }),
      userId: "actor",
      member: actor,
      targetUser: { id: "owner" },
      nickname: "New",
    });

    await nickCommand.execute(interaction as any, services() as any);

    expect(replies).toHaveLength(1);
    expect(changes).toEqual([]);
  });
});
