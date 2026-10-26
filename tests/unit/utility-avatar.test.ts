import { describe, expect, it } from "vitest";
import { MessageFlags } from "discord.js";
import utilityModule from "../../modules/utility/src/index.js";

const makeUser = (id: string, displayName: string) => ({
  id,
  displayName,
  avatar: "avatar-hash",
  displayAvatarURL: () =>
    `https://cdn.discordapp.com/avatars/${id}/avatar-hash.png?size=4096`,
});

const makeInteraction = (self: any, target: any) => {
  const replies: any[] = [];
  return {
    replies,
    interaction: {
      user: self,
      options: { getUser: () => target },
      reply: async (card: any) => {
        replies.push(card);
      },
    },
  };
};

const containerOf = (card: any) =>
  JSON.parse(JSON.stringify(card.components[0]));

const avatarCommand = utilityModule.commands.find(
  (command) => command.data.name === "avatar",
)!;
const bannerCommand = utilityModule.commands.find(
  (command) => command.data.name === "banner",
)!;

describe("avatar command", () => {
  it("registers short prefix aliases", () => {
    expect(avatarCommand.aliases).toEqual(["av"]);
    expect(bannerCommand.aliases).toEqual(["b"]);
  });

  it("shows the media gallery and link for yourself", async () => {
    const self = makeUser("1", "ReBiz");
    const { interaction, replies } = makeInteraction(self, self);

    await avatarCommand.execute(interaction as any, {} as any);

    const card = replies[0];
    const container = containerOf(card);

    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect(container.components[0].content).toBe("## ReBiz's Avatar");
    expect(container.components[2].type).toBe(12);
    expect(container.components[2].items[0].media.url).toBe(
      "https://cdn.discordapp.com/avatars/1/avatar-hash.png?size=4096",
    );
    expect(container.components[3].components[0]).toMatchObject({
      label: "Avatar Link",
      style: 5,
    });
  });

  it("shows a view button for someone else", async () => {
    const self = makeUser("1", "ReBiz");
    const target = makeUser("2", "Alice");
    const { interaction, replies } = makeInteraction(self, target);

    await avatarCommand.execute(interaction as any, {} as any);

    const card = replies[0];
    const container = containerOf(card);

    expect(card.flags).toBe(
      MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    );
    expect(container.components[0].content).toBe("## Alice's Avatar");
    expect(container.components.some((component: any) => component.type === 12)).toBe(
      false,
    );
    expect(container.components[2].components[0]).toMatchObject({
      custom_id: "utility:avatar:view:2",
      label: "View Avatar",
      style: 1,
    });
  });

  it("reveals the avatar from the view button", async () => {
    const target = makeUser("2", "Alice");
    const replies: any[] = [];
    const interaction = {
      customId: "utility:avatar:view:2",
      isButton: () => true,
      client: {
        users: {
          fetch: async () => target,
        },
      },
      reply: async (card: any) => {
        replies.push(card);
      },
    };

    await utilityModule.listeners[0]!.handler(interaction as any, {} as any);

    const card = replies[0];
    const container = containerOf(card);

    expect(card.flags).toBe(
      MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    );
    expect(container.components[2].type).toBe(12);
    expect(container.components[3].components[0]).toMatchObject({
      label: "Avatar Link",
      style: 5,
    });
  });
});
