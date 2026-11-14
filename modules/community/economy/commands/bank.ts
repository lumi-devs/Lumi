import type { CommandDefinition, EconomyFailureReason } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { bankGuard, getEconomyConfig } from "../config.js";
import { formatMoney, requireGuild } from "../format.js";
import { depositToBank, getOrCreateUser, withdrawFromBank } from "../store.js";

const failureMessages: Record<EconomyFailureReason, string> = {
  invalid_amount: "That amount is not valid.",
  invalid_recipient: "That recipient is not valid.",
  below_minimum: "That amount is below the minimum.",
  above_maximum: "That amount is above the maximum.",
  transfer_cap_exceeded: "That amount exceeds the limit.",
  daily_cap_exceeded: "You have reached the daily limit.",
  insufficient_funds: "Insufficient funds.",
};

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
    const result = await depositToBank(
      services,
      guildId,
      userId,
      amount,
      bankGuard(config),
    );

    if (!result.ok) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            result.reason === "insufficient_funds"
              ? "Insufficient funds"
              : "Deposit blocked",
            [
              `**Wallet** — ${formatMoney(symbol, user.balance)}`,
              ...(result.reason === "insufficient_funds"
                ? [`**Needed** — ${formatMoney(symbol, amount)}`]
                : [failureMessages[result.reason ?? "invalid_amount"]]),
            ],
          ),
        ),
      );
      return;
    }

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Deposited", [
          `**Amount** — ${formatMoney(symbol, amount)}`,
          `**Wallet** — ${formatMoney(symbol, result.balance?.balance ?? 0n)}`,
          `**Bank** — ${formatMoney(symbol, result.balance?.bankBalance ?? 0n)}`,
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
    const result = await withdrawFromBank(
      services,
      guildId,
      userId,
      amount,
      bankGuard(config),
    );

    if (!result.ok) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            result.reason === "insufficient_funds"
              ? "Insufficient funds"
              : "Withdrawal blocked",
            [
              `**Bank** — ${formatMoney(symbol, user.bankBalance)}`,
              ...(result.reason === "insufficient_funds"
                ? [`**Needed** — ${formatMoney(symbol, amount)}`]
                : [failureMessages[result.reason ?? "invalid_amount"]]),
            ],
          ),
        ),
      );
      return;
    }

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Withdrawn", [
          `**Amount** — ${formatMoney(symbol, amount)}`,
          `**Wallet** — ${formatMoney(symbol, result.balance?.balance ?? 0n)}`,
          `**Bank** — ${formatMoney(symbol, result.balance?.bankBalance ?? 0n)}`,
        ]),
      ),
    );
  },
};
