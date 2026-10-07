import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { applyLocalizedBuilder } from "#lib/i18n/index.js";
import type { CommandContext } from "#lib/command-context.js";
import type { LumiT } from "#lib/i18n/index.js";
import { AfkMaxReasonLength } from "../constants.js";
import { sanitizeReason } from "@lumi/application/services/afk/format.js";
import { Emojis } from "#lib/utilities/assets.js";
import type { AfkUtility } from "../utilities/AfkUtility.js";

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
      title: `${Emojis.Edit} ${t("commands:afkUpdatedTitle")}`,
      body: t("commands:afkUpdated", { reason }),
    };
  }
  return {
    title: `${Emojis.Afk} ${t("commands:afkSetTitle")}`,
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
    return (
    applyLocalizedBuilder(builder, "commands:afk").addStringOption((opt) =>
            applyLocalizedBuilder(opt, "commands:afkReason")
              .setMaxLength(AfkMaxReasonLength)
              .setRequired(false),
          )
    ) as SlashCommandBuilder;
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
    return ctx.replyInfo(title, body);
  }
};
