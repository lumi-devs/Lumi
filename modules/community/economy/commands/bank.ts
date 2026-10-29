import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { getEconomyConfig } from "../config.js";
import { formatMoney, requireGuild } from "../format.js";
import {
  depositToBank,
  getOrCreateUser,
  recordTransaction,
  withdrawFromBank,
} from "../store.js";

export const depositDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Deposit money to bank")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to deposit")
        .setMinValue(1)
        .setRequired(true),
    ),
  async execute(interaction, services) {
    const guild = await requireGuild(interaction);
    if (!guild) return;

    const amount = BigInt(interaction.options.getInteger("amount", true));
    const guildId = guild.id;
    const userId = interaction.user.id;
    const config = await getEconomyConfig(services, guildId);
    const symbol = config.currencySymbol;

    const user = await getOrCreateUser(services, guildId, userId, config);
    if (
      user.balance < amount ||
      !(await depositToBank(services, guildId, userId, amount))
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

    await recordTransaction(services, {
      guildId,
      fromUserId: userId,
      amount,
      type: "deposit",
    });

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Deposited", [
          `**Amount** — ${formatMoney(symbol, amount)}`,
          `**Wallet** — ${formatMoney(symbol, user.balance - amount)}`,
          `**Bank** — ${formatMoney(symbol, user.bankBalance + amount)}`,
        ]),
      ),
    );
  },
};

export const withdrawDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw money from bank")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to withdraw")
        .setMinValue(1)
        .setRequired(true),
    ),
  async execute(interaction, services) {
    const guild = await requireGuild(interaction);
    if (!guild) return;

    const amount = BigInt(interaction.options.getInteger("amount", true));
    const guildId = guild.id;
    const userId = interaction.user.id;
    const config = await getEconomyConfig(services, guildId);
    const symbol = config.currencySymbol;

    const user = await getOrCreateUser(services, guildId, userId, config);
    if (
      user.bankBalance < amount ||
      !(await withdrawFromBank(services, guildId, userId, amount))
    ) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Insufficient funds", [
            `**Bank** — ${formatMoney(symbol, user.bankBalance)}`,
            `**Needed** — ${formatMoney(symbol, amount)}`,
          ]),
        ),
      );
      return;
    }

    await recordTransaction(services, {
      guildId,
      toUserId: userId,
      amount,
      type: "withdraw",
    });

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Withdrawn", [
          `**Amount** — ${formatMoney(symbol, amount)}`,
          `**Wallet** — ${formatMoney(symbol, user.balance + amount)}`,
          `**Bank** — ${formatMoney(symbol, user.bankBalance - amount)}`,
        ]),
      ),
    );
  },
};
