import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { getEconomyConfig } from "../config.js";
import { formatMoney, requireGuild } from "../format.js";
import {
  creditWallet,
  debitWallet,
  getOrCreateUser,
  recordTransaction,
  refundWallet,
} from "../store.js";

export const transferDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Transfer money to another user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to pay")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to transfer")
        .setMinValue(1)
        .setRequired(true),
    ),
  async execute(interaction, services) {
    const guild = await requireGuild(interaction);
    if (!guild) return;

    const target = interaction.options.getUser("user", true);
    const amount = BigInt(interaction.options.getInteger("amount", true));
    const guildId = guild.id;
    const userId = interaction.user.id;
    const config = await getEconomyConfig(services, guildId);
    const symbol = config.currencySymbol;

    if (target.id === userId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Invalid recipient", "You cannot pay yourself."),
        ),
      );
      return;
    }
    if (target.bot) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Invalid recipient", "You cannot pay bots."),
        ),
      );
      return;
    }

    const user = await getOrCreateUser(services, guildId, userId, config);
    const tax = (amount * BigInt(Math.floor(config.taxRate * 10_000))) / 10_000n;
    const netAmount = amount - tax;

    if (
      user.balance < amount ||
      !(await debitWallet(services, guildId, userId, amount, {
        trackSpent: true,
      }))
    ) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Insufficient funds", [
            `**Wallet** — ${formatMoney(symbol, user.balance)}`,
            `**Needed** — ${formatMoney(symbol, amount)}`,
          ]),
        ),
      );
      return;
    }

    try {
      await creditWallet(services, guildId, target.id, netAmount, {
        trackEarned: true,
      });
      await recordTransaction(services, {
        guildId,
        fromUserId: userId,
        amount,
        type: "transfer_out",
        description: `Paid ${target.tag}`,
      });
      await recordTransaction(services, {
        guildId,
        toUserId: target.id,
        amount: netAmount,
        type: "transfer_in",
        description: `Received from ${interaction.user.tag}`,
      });
      if (tax > 0n) {
        await recordTransaction(services, {
          guildId,
          fromUserId: userId,
          amount: tax,
          type: "tax",
          description: "Transfer tax",
        });
      }
    } catch (error) {
      await refundWallet(services, guildId, userId, amount).catch(() => undefined);
      services.observability?.logger?.error?.(
        "[economy] transfer failed after debit",
        { error, guildId, userId, targetId: target.id },
      );
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Payment failed",
            "The transfer could not be completed. Your balance was restored.",
          ),
        ),
      );
      return;
    }

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Payment sent", [
          `**Recipient** — ${target.tag}`,
          `**Sent** — ${formatMoney(symbol, amount)}`,
          ...(tax > 0n
            ? [
                `**Tax** — ${formatMoney(symbol, tax)}`,
                `**Received** — ${formatMoney(symbol, netAmount)}`,
              ]
            : []),
        ]),
      ),
    );
  },
};
