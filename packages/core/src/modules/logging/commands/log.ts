import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { issueLogClaimCode, LogClaimCodeTtlMs } from "#lib/logging/claims.js";
import { formatDuration } from "#utilities/time.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "log",
  description: "Manage server event logging",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  subcommands: [{ name: "claim", run: "claim" }],
})
export class LogCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("claim")
            .setDescription("Issue a one-time code to claim a log channel"),
        ),
    );
  }

  public async claim(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const code = await issueLogClaimCode(guildId, ctx.user.id);

    return ctx.replySuccess(
      "Claim code issued",
      `Post exactly this code as a message in the channel to claim it: \`${code}\`\n` +
        `Single use, expires in ${formatDuration(LogClaimCodeTtlMs)}. Only a post by someone with Manage Server registers the claim, which a manager then confirms on the dashboard.`,
    );
  }
}
