import type { CommandDefinition } from "@lumi/module-kit";
import {
  ephemeralCard,
  formatPageFooter,
  makeEmptyCard,
  makeErrorCard,
  makeListCard,
  makeSuccessCard,
} from "@lumi/ui";
import {
  AttachmentBuilder,
  type GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { getEconomyConfig } from "../config.js";
import { formatMoney, requireGuild } from "../format.js";
import type { ShopCardData, ShopItemData } from "../shopCard.js";
import {
  debitWallet,
  getOrCreateUser,
  recordTransaction,
  refundWallet,
} from "../store.js";

const ShopPerPage = 4;

export const shopDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View the server shop")
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
    const config = await getEconomyConfig(services, guild.id);
    const symbol = config.currencySymbol;
    const currencyName = config.currencyName;
    const items = config.shopItems;
    const totalPages = Math.max(1, Math.ceil(items.length / ShopPerPage));
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    const paginatedItems = items.slice(
      (page - 1) * ShopPerPage,
      page * ShopPerPage,
    );

    if (paginatedItems.length === 0) {
      await interaction.reply(
        ephemeralCard(
          makeEmptyCard(
            "Shop",
            "The shop is empty.",
            "An administrator can add items in the economy configuration.",
          ),
        ),
      );
      return;
    }

    const lines = paginatedItems.map(
      (item) =>
        `**${item.name}** — ${symbol} ${item.price.toLocaleString()} · ${item.type}\n-# ${item.description}`,
    );
    const options = {
      subtitle: `${guild.name} · ${currencyName}`,
      thumbnailUrl:
        guild.iconURL({ size: 256, extension: "png" }) ?? undefined,
      footer: formatPageFooter(page - 1, totalPages, items.length),
    };

    const shopItems: ShopItemData[] = paginatedItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      type: item.type,
      roleId: item.roleId,
      currencySymbol: symbol,
    }));

    const cardData: ShopCardData = {
      guildName: guild.name,
      guildIconUrl: guild.iconURL({ size: 256, extension: "png" }),
      currencyName,
      currencySymbol: symbol,
      items: shopItems,
      page,
      totalPages,
    };

    let attachment: AttachmentBuilder | null = null;
    try {
      const { generateShopCard } = await import("../shopCard.js");
      attachment = new AttachmentBuilder(await generateShopCard(cardData), {
        name: "shop.png",
      });
    } catch (error) {
      services.observability?.logger?.warn?.(
        "[economy] shop card generation failed",
        { error },
      );
    }

    if (attachment) {
      await interaction.reply({
        ...ephemeralCard(
          makeListCard("🛒 Shop", lines, {
            ...options,
            headerImages: ["attachment://shop.png"],
          }),
        ),
        files: [attachment],
      });
      return;
    }

    await interaction.reply(
      ephemeralCard(makeListCard("🛒 Shop", lines, options)),
    );
  },
};

export const buyDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy an item from the shop")
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription("Item ID to buy")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async execute(interaction, services) {
    const guild = await requireGuild(interaction);
    if (!guild) return;

    const itemId = interaction.options.getString("item", true);
    const guildId = guild.id;
    const userId = interaction.user.id;
    const config = await getEconomyConfig(services, guildId);
    const symbol = config.currencySymbol;
    const item = config.shopItems.find((entry) => entry.id === itemId);

    if (!item) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Item not found",
            "That item is not in the shop.",
          ),
        ),
      );
      return;
    }

    const user = await getOrCreateUser(services, guildId, userId, config);
    const price = BigInt(item.price);

    let roleId: string | null = null;
    let member: GuildMember | null = null;

    if (item.type === "role") {
      if (!item.roleId) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Role unavailable",
              "This item is misconfigured and cannot be purchased.",
            ),
          ),
        );
        return;
      }

      const role = await guild.roles.fetch(item.roleId).catch(() => null);
      if (!role) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Role unavailable",
              "The role for this item no longer exists.",
            ),
          ),
        );
        return;
      }

      member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Member unavailable",
              "Could not resolve your server member record.",
            ),
          ),
        );
        return;
      }

      if (member.roles.cache.has(role.id)) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Already owned", "You already have this role."),
          ),
        );
        return;
      }

      roleId = role.id;
    }

    if (
      user.balance < price ||
      !(await debitWallet(services, guildId, userId, price, {
        trackSpent: true,
      }))
    ) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Insufficient funds", [
            `**Wallet** — ${formatMoney(symbol, user.balance)}`,
            `**Price** — ${formatMoney(symbol, price)}`,
          ]),
        ),
      );
      return;
    }

    if (roleId && member) {
      try {
        await member.roles.add(roleId, "Shop purchase");
      } catch (error) {
        await refundWallet(services, guildId, userId, price).catch(
          () => undefined,
        );
        services.observability?.logger?.error?.(
          "[economy] failed to grant purchased role",
          { error, guildId, userId, roleId },
        );
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Purchase failed",
              "The role could not be granted. Your balance was restored.",
            ),
          ),
        );
        return;
      }
    }

    await recordTransaction(services, {
      guildId,
      fromUserId: userId,
      amount: price,
      type: "shop_purchase",
      description: `Bought ${item.name}`,
    });

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Purchase complete", [
          `**Item** — ${item.name}`,
          `**Price** — ${formatMoney(symbol, price)}`,
          `**Wallet** — ${formatMoney(symbol, user.balance - price)}`,
        ]),
      ),
    );
  },
  async autocomplete(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused();
    const config = await getEconomyConfig(services, guildId);
    const choices = config.shopItems
      .filter((item) =>
        item.name.toLowerCase().includes(focused.toLowerCase()),
      )
      .slice(0, 25)
      .map((item) => ({
        name: `${item.name} (${config.currencySymbol} ${item.price})`,
        value: item.id,
      }));

    await interaction.respond(choices);
  },
};
