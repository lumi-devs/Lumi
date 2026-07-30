import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { ChannelType } from "discord.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "lockdown",
  description: "Enable or disable server lockdown",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.lockdown",
  subcommands: [
    { name: "enable", run: "enable" },
    { name: "disable", run: "disable" },
  ],
})
export class LockdownCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s.setName("enable").setDescription("Lock down all text channels")
        )
        .addSubcommand((s) =>
          s.setName("disable").setDescription("Remove lockdown from text channels")
        ),
    );
  }

  public async enable(ctx: CommandContext) {
    await ctx.defer();
    const guild = ctx.guild!;
    let modified = 0;
    let failed = 0;

    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (channel && channel.type === ChannelType.GuildText) {
        try {
          await channel.permissionOverwrites.edit(guild.id, {
            SendMessages: false,
          });
          modified++;
        } catch (e) {
          failed++;
        }
      }
    }

    if (modified === 0 && failed > 0) {
      return ctx.replyError("Lockdown Failed", `Could not modify permissions for ${failed} channels.`);
    }

    return ctx.replySuccess(
      "Lockdown Enabled",
      `Successfully disabled SendMessages for @everyone in ${modified} text channel(s).`
    );
  }

  public async disable(ctx: CommandContext) {
    await ctx.defer();
    const guild = ctx.guild!;
    let modified = 0;
    let failed = 0;

    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (channel && channel.type === ChannelType.GuildText) {
        try {
          await channel.permissionOverwrites.edit(guild.id, {
            SendMessages: null,
          });
          modified++;
        } catch (e) {
          failed++;
        }
      }
    }

    if (modified === 0 && failed > 0) {
      return ctx.replyError("Lockdown Disable Failed", `Could not modify permissions for ${failed} channels.`);
    }

    return ctx.replySuccess(
      "Lockdown Disabled",
      `Successfully restored SendMessages for @everyone in ${modified} text channel(s).`
    );
  }
}
