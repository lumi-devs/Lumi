import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { PermissionFlagsBits } from "discord.js";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { emptySetupState } from "#modules/core/lib/setup-wizard.js";
import { buildSetupStepView } from "#modules/core/ui/setup-wizard.js";

@ApplyOptions<BaseCommand.Options>({
  name: "setup",
  description: "Launch the ephemeral server setup wizard.",
  preconditions: ["GuildOnly"],
  requiredUserPermissions: [PermissionFlagsBits.ManageGuild],
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
export class SetupCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext): Promise<void> {
    await ctx.reply(buildSetupStepView(1, emptySetupState()));
  }
}
