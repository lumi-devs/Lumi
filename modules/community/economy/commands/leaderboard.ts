import type { CommandDefinition } from "@lumi/module-kit";
import {
  AccentColors,
  ephemeralCard,
  formatPageFooter,
  makeCard,
  makeEmptyCard,
} from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { getEconomyConfig } from "../config.js";
import { requireGuild } from "../format.js";

const PerPage = 10;

export const leaderboardDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("baltop")
    .setDescription("View the richest users")
    .addIntegerOption((option) =>
      option
        .setName("page")
        .setDescription("Page number")
        .setMinValue(1)
        .setRequired(false),
    ),
  async execute(interaction, services) {
    const guild = await requireGuild(interaction);
    if (!guild) return;

    const requestedPage = interaction.options.getInteger("page") ?? 1;
    const guildId = guild.id;
    const config = await getEconomyConfig(services, guildId);
    const symbol = config.currencySymbol;

    const [total, allUsers] = await Promise.all([
      services.db.prisma.economyUser.count({ where: { guildId } }),
      services.db.prisma.economyUser.findMany({
        where: { guildId },
        orderBy: { balance: "desc" },
        skip: Math.max(0, requestedPage - 1) * PerPage,
        take: PerPage,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PerPage));
    const page = Math.min(Math.max(1, requestedPage), totalPages);

    let users = allUsers;
    if (page !== requestedPage) {
      users = await services.db.prisma.economyUser.findMany({
        where: { guildId },
        orderBy: { balance: "desc" },
        skip: (page - 1) * PerPage,
        take: PerPage,
      });
    }

    if (users.length === 0) {
      await interaction.reply(
        ephemeralCard(
          makeEmptyCard(
            "No economy data",
            "Nobody has earned currency in this server yet.",
            "Use `/daily` or `/work` to get started.",
          ),
        ),
      );
      return;
    }

    const lines = users.map(
      (user: { userId: string; balance: bigint }, index: number) => {
        const member = guild.members.cache.get(user.userId);
        const name = member?.user.tag ?? `Unknown (${user.userId})`;
        return `**#${(page - 1) * PerPage + index + 1}** ${name} — ${symbol} ${user.balance.toLocaleString()}`;
      },
    );

    await interaction.reply(
      ephemeralCard(
        makeCard(AccentColors.gold, "🏆 Richest Users", lines, {
          subtitle: guild.name,
          footer: formatPageFooter(page - 1, totalPages, total),
        }),
      ),
    );
  },
};
