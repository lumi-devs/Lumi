import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { enterPanic } from "@lumi/application/services/security/panic.js";
import { toStringArray } from "@lumi/lib/module-system/config-schema.js";
import { confirmPrompt } from "@lumi/lib/utilities/confirm.js";
import {
  buildPanicAlreadyActiveCard,
  buildPanicCancelledCard,
  buildPanicStatusCard,
} from "../ui/panic-card.js";

export const panicDef: CommandDef = {
  name: "panic",
  description: "Lock down the server: pause invites and mute @everyone in text channels.",
  guildOnly: true,
  requiredPermit: "admin.*",
  build: () => {
    const b = new SlashCommandBuilder().setName("panic");
    return (
    b.setName("panic").setDescription("Lock down the server: pause invites and mute @everyone in text channels.")
    );
  },
  run: async (ctx: CommandContext) => {
    await ctx.defer();
    const t = await ctx.fetchT();
    const guild = ctx.guild!;

    const existing = await ctx.services.db.security.getPanicState(guild.id);
    if (existing) {
      return ctx.reply(
        buildPanicAlreadyActiveCard(t, existing.startedAt),
      );
    }

    const { confirmed } = await confirmPrompt(ctx, {
      title: t("panels:panicConfirmTitle"),
      body: t("panels:panicConfirmBody"),
      confirmLabel: t("panels:panicConfirmButton"),
      time: 20_000,
    });

    if (!confirmed) {
      return ctx.reply(buildPanicCancelledCard(t));
    }

    const raw = await ctx.services.db.config.getAllModuleConfig(
      guild.id,
      "security",
    );
    const channelIds = toStringArray(raw["panic_lock_channel_ids"]);

    const result = await enterPanic(
      guild.id,
      ctx.user.id,
      channelIds,
    );

    return ctx.reply(buildPanicStatusCard(t, result));
  }
};
