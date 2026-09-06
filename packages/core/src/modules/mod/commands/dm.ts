import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { makeInfoCard } from "#lib/utilities/cards.js";

const MaxMessageLength = 2000;

@ApplyOptions<BaseCommand.Options>({
  name: "dm",
  description: "Relay a direct message through the bot to a user",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.dm",
  prefixEnabled: true,
})
export class DmCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((o) =>
          o.setName("user").setDescription("User to message").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("message")
            .setDescription("Message to send")
            .setRequired(true)
            .setMaxLength(MaxMessageLength),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const target = await ctx.getUser("user", { required: true });
    const message = await ctx.getString("message", {
      required: true,
      rest: true,
    });
    if (!target) return;

    const guildName = ctx.guild?.name ?? "the server";
    const card = makeInfoCard(
      `📨 Message from ${guildName} staff`,
      message!,
    );
    const sent = await target.send(card).catch(() => null);

    if (!sent) {
      return ctx.replyError(
        "Could Not Send",
        `${target} has DMs closed or has blocked the bot.`,
      );
    }
    return ctx.replySuccess("Message Sent", `Sent your message to ${target}.`);
  }
}
