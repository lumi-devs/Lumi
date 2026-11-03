import type {
  CommandDefinition,
  EconomyFailureReason,
  EconomyOperationResult,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { getEconomyConfig, transferGuard } from "../config.js";
import { formatMoney, requireGuild } from "../format.js";
import { getOrCreateUser } from "../store.js";

const failureMessages: Record<EconomyFailureReason, string> = {
  invalid_amount: "That amount is not valid.",
  invalid_recipient: "That recipient is not valid.",
  below_minimum: "That amount is below the minimum transfer.",
  above_maximum: "That amount is above the maximum transfer.",
  transfer_cap_exceeded: "That amount exceeds the per-transfer limit.",
  daily_cap_exceeded: "You have reached the daily transfer limit.",
  insufficient_funds: "Insufficient funds.",
};

export const transferDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Transfer money to another user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to pay").setRequired(true),
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

    await getOrCreateUser(services, guildId, userId, config);
    const fee =
      (amount * BigInt(Math.floor(config.taxRate * 10_000))) / 10_000n;

    let result: EconomyOperationResult;
    try {
      result = await services.helpers.economy.transfer({
        guildId,
        fromUserId: userId,
        toUserId: target.id,
        amount,
        guard: transferGuard(config, fee),
        outDescription: `Paid ${target.tag}`,
        inDescription: `Received from ${interaction.user.tag}`,
        feeDescription: "Transfer tax",
      });
    } catch (error) {
      services.observability?.logger?.error?.("[economy] transfer failed", {
        error,
        guildId,
        userId,
        targetId: target.id,
      });
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Payment failed",
            "The transfer could not be completed. No money was moved.",
          ),
        ),
      );
      return;
    }

    if (!result.ok) {
      const balance = await services.helpers.economy.getBalance(
        guildId,
        userId,
      );
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            result.reason === "insufficient_funds"
              ? "Insufficient funds"
              : "Payment blocked",
            [
              ...(result.reason === "insufficient_funds"
                ? [
                    `**Wallet** — ${formatMoney(symbol, balance?.balance ?? 0n)}`,
                    `**Needed** — ${formatMoney(symbol, amount)}`,
                  ]
                : [failureMessages[result.reason ?? "invalid_amount"]]),
            ],
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
          ...(result.fee > 0n
            ? [
                `**Tax** — ${formatMoney(symbol, result.fee)}`,
                `**Received** — ${formatMoney(symbol, result.netAmount)}`,
              ]
            : []),
        ]),
      ),
    );
  },
};
