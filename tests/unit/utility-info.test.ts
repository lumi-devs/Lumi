import { describe, expect, it } from "vitest";
import utilityModule from "../../modules/utility/info/index.ts";

const infoCommand = utilityModule.commands.find(
  (command) => command.data.name === "info",
)!;

describe("info command", () => {
  it("replaces the legacy channel, role, and emoji commands", () => {
    const names = utilityModule.commands.map((command) => command.data.name);

    expect(names).toContain("info");
    expect(names).not.toContain("channelinfo");
    expect(names).not.toContain("roleinfo");
    expect(names).not.toContain("emojiinfo");
  });

  it("exposes channel, role, and emoji subcommands", () => {
    const data = infoCommand.data.toJSON();
    const options = "options" in data ? data.options : undefined;

    expect(options?.map((option) => option.name)).toEqual([
      "channel",
      "role",
      "emoji",
    ]);
  });

  it("renders channel information", async () => {
    const replies: unknown[] = [];
    const interaction = {
      options: {
        getSubcommand: () => "channel",
        getChannel: () => ({
          id: "123456789012345678",
          name: "general",
          guildId: "987654321098765432",
          type: { toString: () => "GuildText" },
        }),
      },
      channel: null,
      reply: async (card: unknown) => {
        replies.push(card);
      },
    };

    await infoCommand.execute(interaction as never, {} as never);

    expect(JSON.stringify(replies[0])).toContain("Channel Info");
  });
});
