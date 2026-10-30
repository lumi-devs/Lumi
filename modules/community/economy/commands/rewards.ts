import type { CommandDefinition, ModuleServices } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { type EconomyConfig, getEconomyConfig } from "../config.js";
import { formatMoney, requireGuild } from "../format.js";
import {
  addBalance,
  claimReward,
  getOrCreateUser,
  type RewardField,
} from "../store.js";

const DailyCooldownMs = 24 * 60 * 60 * 1000;
const WeeklyCooldownMs = 7 * 24 * 60 * 60 * 1000;

interface RewardDefinition {
  label: string;
  field: RewardField;
  cooldownMs: number;
  amount: (config: EconomyConfig) => number;
  type: string;
  description: string;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

async function claimFixedReward(
  interaction: Parameters<CommandDefinition["execute"]>[0],
  services: ModuleServices,
  reward: RewardDefinition,
): Promise<void> {
  const guild = await requireGuild(interaction);
  if (!guild) return;

  const guildId = guild.id;
  const userId = interaction.user.id;
  const config = await getEconomyConfig(services, guildId);
  const user = await getOrCreateUser(services, guildId, userId, config);
  const now = new Date();
  const lastClaim = user[reward.field];

  if (lastClaim) {
    const nextAt = new Date(new Date(lastClaim).getTime() + reward.cooldownMs);
    if (nextAt.getTime() > now.getTime()) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Already claimed", [
            `**Next ${reward.label}** — <t:${Math.floor(nextAt.getTime() / 1000)}:R>`,
          ]),
        ),
      );
      return;
    }
  }

  const claimed = await claimReward(
    services,
    guildId,
    userId,
    reward.field,
    reward.cooldownMs,
    now,
  );
  if (!claimed) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Already claimed", [
          `**Next ${reward.label}** — <t:${Math.floor((now.getTime() + reward.cooldownMs) / 1000)}:R>`,
        ]),
      ),
    );
    return;
  }

  const rewardAmount = BigInt(reward.amount(config));
  await addBalance(
    services,
    guildId,
    userId,
    rewardAmount,
    reward.type,
    reward.description,
  );

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(`${capitalize(reward.label)} claimed`, [
        `**Reward** — ${formatMoney(config.currencySymbol, rewardAmount)}`,
        `**Next ${reward.label}** — <t:${Math.floor((now.getTime() + reward.cooldownMs) / 1000)}:R>`,
      ]),
    ),
  );
}

export const dailyDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward"),
  async execute(interaction, services) {
    await claimFixedReward(interaction, services, {
      label: "daily",
      field: "lastDailyAt",
      cooldownMs: DailyCooldownMs,
      amount: (config) => config.dailyAmount,
      type: "daily",
      description: "Daily reward",
    });
  },
};

export const weeklyDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("weekly")
    .setDescription("Claim your weekly reward"),
  async execute(interaction, services) {
    await claimFixedReward(interaction, services, {
      label: "weekly",
      field: "lastWeeklyAt",
      cooldownMs: WeeklyCooldownMs,
      amount: (config) => config.weeklyAmount,
      type: "weekly",
      description: "Weekly reward",
    });
  },
};

export const workDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Work for money"),
  async execute(interaction, services) {
    const guild = await requireGuild(interaction);
    if (!guild) return;

    const guildId = guild.id;
    const userId = interaction.user.id;
    const config = await getEconomyConfig(services, guildId);
    const user = await getOrCreateUser(services, guildId, userId, config);
    const now = new Date();
    const cooldownMs = config.workCooldown * 1000;

    if (user.lastWorkAt) {
      const nextAt = new Date(
        new Date(user.lastWorkAt).getTime() + cooldownMs,
      );
      if (nextAt.getTime() > now.getTime()) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("On cooldown", [
              `**Next shift** — <t:${Math.floor(nextAt.getTime() / 1000)}:R>`,
            ]),
          ),
        );
        return;
      }
    }

    const claimed = await claimReward(
      services,
      guildId,
      userId,
      "lastWorkAt",
      cooldownMs,
      now,
    );
    if (!claimed) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("On cooldown", [
            `**Next shift** — <t:${Math.floor((now.getTime() + cooldownMs) / 1000)}:R>`,
          ]),
        ),
      );
      return;
    }

    const maxPay = Math.max(config.workMinPay, config.workMaxPay);
    const amount = BigInt(
      Math.floor(Math.random() * (maxPay - config.workMinPay + 1)) +
        config.workMinPay,
    );
    await addBalance(services, guildId, userId, amount, "work", "Worked");

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Work complete", [
          `**Earned** — ${formatMoney(config.currencySymbol, amount)}`,
          `**Next shift** — <t:${Math.floor((now.getTime() + cooldownMs) / 1000)}:R>`,
        ]),
      ),
    );
  },
};
