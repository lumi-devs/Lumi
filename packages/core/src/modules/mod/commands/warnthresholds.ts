import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, container } from "@sapphire/framework";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { getThresholds } from "../lib/thresholds.js";
import { buildWarnThresholdsPanelView } from "../lib/warn-thresholds-panel.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "warnthresholds",
  aliases: ["warnconfig", "warnrules"],
  description: "Interactive Warning Escalation Control Panel",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.config",
  prefixEnabled: true,
  subcommands: [
    { name: "panel", run: "showPanel", default: true },
    { name: "set", run: "showPanel" },
    { name: "remove", run: "showPanel" },
    { name: "list", run: "showPanel" },
  ],
})
export class WarnThresholdsCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) => s.setName("panel").setDescription("Open the interactive Warning Escalation panel"))
        .addSubcommand((s) => s.setName("set").setDescription("Configure warning thresholds"))
        .addSubcommand((s) => s.setName("remove").setDescription("Remove warning thresholds"))
        .addSubcommand((s) => s.setName("list").setDescription("List active warning thresholds")),
    );
  }

  public async showPanel(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const thresholds = await getThresholds(container, ctx.guildId!);
    const decayRaw = await container.db.config.getModuleConfig(ctx.guildId!, "mod", "warn_decay_days");
    const decayDays = typeof decayRaw === "number" ? decayRaw : 30;

    const view = buildWarnThresholdsPanelView(thresholds, decayDays);
    const renderCtx = {
      sessionId: `wt:${ctx.guildId}:${ctx.user.id}`,
      guildId: ctx.guildId!,
      userId: ctx.user.id,
      moduleStore: container.stores.get("modules") as any,
    };

    const rendered = await view.render(renderCtx);
    await ctx.reply(rendered);
  }
}
