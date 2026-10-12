import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { ContainerBuilder } from "@discordjs/builders";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import { applyLocalizedBuilder } from "#src/lib/i18n/Index.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { AfkMaxReasonLength } from "#src/modules/afk/Constants.js";
import { sanitizeReason } from "#src/modules/afk/services/Format.js";
import type { AfkUtility } from "#src/modules/afk/utilities/AfkUtility.js";

function afkStatusText(
  t: LumiT,
  status: "ALREADY_AFK" | "UPDATED_AFK" | "NEW_AFK",
  reason: string,
): { title: string; body: string } {
  if (status === "ALREADY_AFK") {
    return {
      title: `**💤 ${t("commands:afkAlreadyTitle")}**`,
      body: t("commands:afkAlready", { reason }),
    };
  }
  if (status === "UPDATED_AFK") {
    return {
      title: `**✏️ ${t("commands:afkUpdatedTitle")}**`,
      body: t("commands:afkUpdated", { reason }),
    };
  }
  return {
    title: `**💤 ${t("commands:afkSetTitle")}**`,
    body: t("commands:afkSet", { reason }),
  };
}

function afkService(): AfkUtility {
  return getUtility("afk");
}

export const afkDef: CommandDef = {
  name: "afk",
  module: "afk",
  description: "Set yourself AFK with an optional reason.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    const builder = new SlashCommandBuilder().setName("afk");
    return applyLocalizedBuilder(builder, "commands:afk").addStringOption((opt) =>
      applyLocalizedBuilder(opt, "commands:afkReason")
        .setMaxLength(AfkMaxReasonLength)
        .setRequired(false),
    );
  },
  run: async (ctx: CommandContext) => {
    const t = await ctx.fetchT();
    const reason = sanitizeReason(
      (await ctx.getString("reason", { rest: true })) ?? t("afk:defaultReason"),
    );

    const { status } = await afkService().setAfk(
      ctx.services,
      ctx.guildId!,
      ctx.member,
      ctx.user,
      reason,
    );

    const { title, body } = afkStatusText(t, status, reason);
    const container = new ContainerBuilder()
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(title),
      )
      .addSeparatorComponents((separator) => separator.setDivider(true))
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(body),
      );
    return ctx.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [container],
      allowedMentions: { parse: [] },
    });
  }
};
