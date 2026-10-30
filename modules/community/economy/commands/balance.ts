import type { CommandDefinition } from "@lumi/module-kit";
import { AccentColors, ephemeralCard, makeCard } from "@lumi/ui";
import { AttachmentBuilder, SlashCommandBuilder } from "discord.js";
import type { BalanceCardData } from "../balanceCard.js";
import { getEconomyConfig } from "../config.js";
import { requireGuild } from "../format.js";
import { getOrCreateUser } from "../store.js";

export const balanceDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another user's balance")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to check").setRequired(false),
    ),
  async execute(interaction, services) {
    const guild = await requireGuild(interaction);
    if (!guild) return;

    const target = interaction.options.getUser("user") ?? interaction.user;
    const config = await getEconomyConfig(services, guild.id);
    const user = await getOrCreateUser(services, guild.id, target.id, config);

    const symbol = config.currencySymbol;
    const title = `${symbol} ${target.username}`;
    const body = [
      `**${symbol} Wallet** — ${user.balance.toLocaleString()}`,
      `**🏦 Bank** — ${user.bankBalance.toLocaleString()}`,
      `**📈 Total earned** — ${user.totalEarned.toLocaleString()}`,
      `**📉 Total spent** — ${user.totalSpent.toLocaleString()}`,
    ];
    const options = {
      subtitle: `${config.currencyName} • ${target.tag}`,
      thumbnailUrl: target.displayAvatarURL({ size: 256, extension: "png" }),
      footer: guild.name,
    };

    const cardData: BalanceCardData = {
      username: target.username,
      avatarUrl: target.displayAvatarURL({ size: 256, extension: "png" }),
      balance: user.balance.toString(),
      bankBalance: user.bankBalance.toString(),
      currencySymbol: symbol,
      currencyName: config.currencyName,
      totalEarned: user.totalEarned.toString(),
      totalSpent: user.totalSpent.toString(),
    };

    let attachment: AttachmentBuilder | null = null;
    try {
      const { generateBalanceCard } = await import("../balanceCard.js");
      attachment = new AttachmentBuilder(await generateBalanceCard(cardData), {
        name: "balance.png",
      });
    } catch (error) {
      services.observability?.logger?.warn?.(
        "[economy] balance card generation failed",
        { error },
      );
    }

    if (attachment) {
      await interaction.reply({
        ...ephemeralCard(
          makeCard(AccentColors.gold, title, body, {
            ...options,
            headerImages: ["attachment://balance.png"],
          }),
        ),
        files: [attachment],
      });
      return;
    }

    await interaction.reply(
      ephemeralCard(makeCard(AccentColors.gold, title, body, options)),
    );
  },
};
