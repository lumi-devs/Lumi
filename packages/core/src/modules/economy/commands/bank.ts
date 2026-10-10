import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import { userMention } from "@discordjs/formatters";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { BankService } from "@lumi/application/services/economy/BankService.js";
import { formatAmount, getEconomyConfig } from "../config.js";
import { reportEconomyError } from "@lumi/application/services/economy/respond.js";

type Vault = "wallet" | "bank";

function vaultChoices() {
  return [
    { name: "Wallet", value: "wallet" },
    { name: "Bank", value: "bank" },
  ] as const;
}

async function adjust(
  ctx: CommandContext,
  operation: "add" | "remove" | "set",
  verb: string,
) {
  await ctx.checkPermit("economy.admin");
  const guildId = ctx.guildId!;
  const config = await getEconomyConfig(ctx.services, guildId);
  const target = await ctx.getUser("user", { required: true });
  const amount = await ctx.getInteger("amount", { required: true });
  const vault = ((await ctx.getString("vault")) ?? "wallet") as Vault;
  const reason = (await ctx.getString("reason")) ?? "no reason given";
  try {
    const balance = await new BankService().adjust(
      guildId,
      target!.id,
      operation,
      amount!,
      vault === "bank" ? "bank" : "wallet",
      reason,
      ctx.user.id,
      config,
    );
    await ctx.replySuccess(
      `Balance ${verb}`,
      `${verb === "set" ? "Set" : verb === "add" ? "Added to" : "Removed from"} ${userMention(target!.id)}'s ${vault} ${operation === "set" ? `to **${formatAmount(config, amount!)}**` : `**${formatAmount(config, amount!)}**`} (${reason}).\nNew total: **${formatAmount(config, balance.total)}**`,
      { ephemeral: false },
    );
  } catch (err) {
    await reportEconomyError(ctx, err);
  }
}

export const bankDef: CommandDef = {
  name: "bank",
  module: "economy",
  description: "Move currency between wallet and bank; staff can adjust balances.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    const builder = new SlashCommandBuilder().setName("bank");
    return (
    builder
            .setName("bank")
            .setDescription("Move currency between wallet and bank; staff can adjust balances.")
            .addSubcommand((sub) =>
              sub
                .setName("deposit")
                .setDescription("Move currency from wallet to bank.")
                .addIntegerOption((opt) =>
                  opt
                    .setName("amount")
                    .setDescription("How much to deposit.")
                    .setMinValue(1)
                    .setRequired(true),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("withdraw")
                .setDescription("Move currency from bank to wallet.")
                .addIntegerOption((opt) =>
                  opt
                    .setName("amount")
                    .setDescription("How much to withdraw.")
                    .setMinValue(1)
                    .setRequired(true),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("set")
                .setDescription("Set a member's balance (staff only).")
                .addUserOption((opt) =>
                  opt
                    .setName("user")
                    .setDescription("Whose balance to set.")
                    .setRequired(true),
                )
                .addIntegerOption((opt) =>
                  opt
                    .setName("amount")
                    .setDescription("The new balance.")
                    .setMinValue(0)
                    .setRequired(true),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("vault")
                    .setDescription("Which balance to set.")
                    .addChoices(...vaultChoices())
                    .setRequired(false),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("reason")
                    .setDescription("Why the balance is changed.")
                    .setMaxLength(200)
                    .setRequired(false),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("add")
                .setDescription("Grant currency to a member (staff only).")
                .addUserOption((opt) =>
                  opt
                    .setName("user")
                    .setDescription("Who receives the currency.")
                    .setRequired(true),
                )
                .addIntegerOption((opt) =>
                  opt
                    .setName("amount")
                    .setDescription("How much to add.")
                    .setMinValue(1)
                    .setRequired(true),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("vault")
                    .setDescription("Which balance to credit.")
                    .addChoices(...vaultChoices())
                    .setRequired(false),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("reason")
                    .setDescription("Why the currency is granted.")
                    .setMaxLength(200)
                    .setRequired(false),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("remove")
                .setDescription("Take currency from a member (staff only).")
                .addUserOption((opt) =>
                  opt
                    .setName("user")
                    .setDescription("Who loses the currency.")
                    .setRequired(true),
                )
                .addIntegerOption((opt) =>
                  opt
                    .setName("amount")
                    .setDescription("How much to remove.")
                    .setMinValue(1)
                    .setRequired(true),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("vault")
                    .setDescription("Which balance to debit.")
                    .addChoices(...vaultChoices())
                    .setRequired(false),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("reason")
                    .setDescription("Why the currency is removed.")
                    .setMaxLength(200)
                    .setRequired(false),
                ),
            )
    );
  },
  handlers: {
  "deposit": async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(ctx.services, guildId);
    const amount = await ctx.getInteger("amount", { required: true });
    try {
      const balance = await new BankService().deposit(
        guildId,
        ctx.user.id,
        amount!,
        config,
      );
      await ctx.replySuccess(
        "Deposited",
        `Moved **${formatAmount(config, amount!)}** to your bank.\nWallet: **${formatAmount(config, balance.wallet)}** · Bank: **${formatAmount(config, balance.bank)}**`,
        { ephemeral: false },
      );
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  },
  "withdraw": async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(ctx.services, guildId);
    const amount = await ctx.getInteger("amount", { required: true });
    try {
      const balance = await new BankService().withdraw(
        guildId,
        ctx.user.id,
        amount!,
        config,
      );
      await ctx.replySuccess(
        "Withdrawn",
        `Moved **${formatAmount(config, amount!)}** to your wallet.\nWallet: **${formatAmount(config, balance.wallet)}** · Bank: **${formatAmount(config, balance.bank)}**`,
        { ephemeral: false },
      );
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  },
  "set": async (ctx: CommandContext) => {
    await adjust(ctx, "set", "set");
  },
  "add": async (ctx: CommandContext) => {
    await adjust(ctx, "add", "add");
  },
  "remove": async (ctx: CommandContext) => {
    await adjust(ctx, "remove", "remove");
  }
  }
};
