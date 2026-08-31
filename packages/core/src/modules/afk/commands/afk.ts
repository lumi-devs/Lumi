import { ApplyOptions } from "@sapphire/decorators";
import { getUtility } from "#lib/module-system/Utility.js";
import { Command } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { AfkMaxReasonLength, sanitizeReason } from "../index.js";
import { Emojis } from "#lib/utilities/assets.js";
import type AfkUtility from "../utilities/AfkUtility.js";

function afkStatusText(
  t: LumiT,
  status: "ALREADY_AFK" | "UPDATED_AFK" | "NEW_AFK",
  reason: string,
): { title: string; body: string } {
  if (status === "ALREADY_AFK") {
    return {
      title: t("commands:afkAlreadyTitle"),
      body: t("commands:afkAlready", { reason }),
    };
  }
  if (status === "UPDATED_AFK") {
    return {
      title: `${Emojis.EDIT} ${t("commands:afkUpdatedTitle")}`,
      body: t("commands:afkUpdated", { reason }),
    };
  }
  return {
    title: `${Emojis.AFK} ${t("commands:afkSetTitle")}`,
    body: t("commands:afkSet", { reason }),
  };
}

@ApplyOptions<BaseCommand.Options>({
  name: "afk",
  description: "Set yourself AFK with an optional reason.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "afk",
  prefixEnabled: true,
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export default class AfkCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      applyLocalizedBuilder(builder, "commands:afk").addStringOption((opt) =>
        applyLocalizedBuilder(opt, "commands:afkReason")
          .setMaxLength(AfkMaxReasonLength)
          .setRequired(false),
      ),
    );
  }

  private get afkService(): AfkUtility {
    return getUtility("afk");
  }

  public override async run(ctx: CommandContext) {
    const t = await ctx.fetchT();
    const reason = sanitizeReason(
      (await ctx.getString("reason", { rest: true })) ?? t("afk:defaultReason"),
    );

    const { status } = await this.afkService.setAfk(
      ctx.guildId!,
      ctx.member,
      ctx.user,
      reason,
    );

    const { title, body } = afkStatusText(t, status, reason);
    return ctx.replyInfo(title, body);
  }
}
