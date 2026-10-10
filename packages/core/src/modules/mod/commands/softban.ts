import {
  runModerationFlow,
  type ModerationCommand as MC,
} from "@lumi/lib/commands/moderation-flow.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import type { ConfirmPromptOptions } from "@lumi/lib/utilities/confirm.js";
import { SoftbanAction } from "@lumi/application/services/mod/actions/softban-action.js";
import type { LumiT } from "@lumi/lib/i18n/index.js";
import type { ModerationCase } from "@prisma/client";
import type { User } from "discord.js";
import { Result } from "@lumi/shared";

const softbanDefFlow: MC.Flow<User, ModerationCase, number> = {
  logScope: "softban",
  resolveTarget: (ctx: MC.RunContext) => {
    return ctx.getUsers("target", { required: true });
  },
  preHandle: async (ctx: MC.RunContext) => {
    const days = (await ctx.getInteger("days")) ?? 1;
    return Result.ok(days);
  },
  resolveReason: (ctx: MC.RunContext) => {
    return ctx
      .getString("reason")
      .then((r) => r ?? "Softban to purge recent message history.");
  },
  confirm: (
    _t: LumiT,
    { target, reason, prepared }: MC.ActionContext<User, number>,
  ): ConfirmPromptOptions => {
    return {
      title: "Confirm Softban",
      body: `You're about to softban **${target.tag}**, banning and immediately unbanning them to purge **${prepared} day(s)** of message history.\n**Reason:** ${reason}`,
      confirmLabel: "I understand, softban them",
    };
  },
  action: ({
    guild,
    target,
    moderator,
    reason,
    prepared,
  }: MC.ActionContext<User, number>) => {
    return SoftbanAction.apply({
      guild,
      targetUser: target,
      moderator,
      reason,
      deleteMessageDays: prepared,
    });
  },
  buildSuccessMessage: (
    _t: LumiT,
    { target, prepared, outcome }: MC.OutcomeContext<User, ModerationCase, number>,
  ) => {
    return {
      title: "Softbanned Member",
      body: `Successfully softbanned **${target.tag}** and purged **${prepared} day(s)** of message history.\n\n**Case:** #${outcome.caseNumber}`,
    };
  },
};

export const softbanDef: CommandDef = {
  name: "softban",
  aliases: ["sban"],
  description:
    "Softban a member (ban and immediately unban to clear recent messages)",
  guildOnly: true,
  requiredPermit: "mod.softBan",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("softban");
    return (
      b
        .setName("softban")
        .setDescription(
          "Softban a member (ban and immediately unban to clear recent messages)",
        )
        .addUserOption((o) =>
          o
            .setName("target")
            .setDescription("Member to softban")
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("days")
            .setDescription("Days of messages to delete (1-7, default 1)")
            .setMinValue(1)
            .setMaxValue(7),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Reason for softban"),
        )
    ) as SlashCommandBuilder;
  },
  run: (ctx: CommandContext) => runModerationFlow(ctx, softbanDefFlow),
};
