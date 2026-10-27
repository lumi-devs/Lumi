import {
  SlashCommandBuilder,
  AttachmentBuilder,
} from "discord.js";
import { defineModule, type CommandDefinition, type ModuleDefinition } from "@lumi/module-kit";
import {
  makeCard,
  makeErrorCard,
  makeSuccessCard,
  makeListCard,
  makeEmptyCard,
  ephemeralCard,
  formatPageFooter,
  AccentColors,
} from "@lumi/ui";
import { z } from "zod";
import type { BalanceCardData } from "./balanceCard.js";
import type { ShopCardData, ShopItemData } from "./shopCard.js";

const EconomyConfigSchema = z.object({
  currencyName: z.string().default("Credits"),
  currencySymbol: z.string().default("💰"),
  startingBalance: z.number().int().default(0),
  dailyAmount: z.number().int().min(0).default(100),
  weeklyAmount: z.number().int().min(0).default(500),
  monthlyAmount: z.number().int().min(0).default(2000),
  interestRate: z.number().min(0).max(1).default(0.01),
  taxRate: z.number().min(0).max(1).default(0),
  workCooldown: z.number().int().min(60).default(3600),
  workMinPay: z.number().int().min(1).default(50),
  workMaxPay: z.number().int().min(1).default(200),
  shopItems: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    price: z.number().int().min(1),
    type: z.enum(["role", "item", "custom"]),
    roleId: z.string().optional(),
    customData: z.record(z.string(), z.any()).optional(),
  })).default([]),
}, {});

type EconomyConfig = z.infer<typeof EconomyConfigSchema>;

async function getOrCreateUser(services: any, guildId: string, userId: string, config: EconomyConfig) {
  return services.db.prisma.economyUser.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {},
    create: { 
      guildId, 
      userId, 
      balance: BigInt(config.startingBalance),
      bankBalance: BigInt(0),
    },
  });
}

async function addBalance(services: any, guildId: string, userId: string, amount: bigint, type: string, description?: string) {
  await services.db.prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { 
      balance: { increment: amount },
      totalEarned: amount > 0 ? { increment: amount } : { increment: 0 },
      totalSpent: amount < 0 ? { increment: -amount } : { increment: 0 },
    },
  });

  await services.db.prisma.economyTransaction.create({
    data: {
      guildId,
      toUserId: amount > 0 ? userId : undefined,
      fromUserId: amount < 0 ? userId : undefined,
      amount: amount > 0 ? amount : -amount,
      type,
      description,
    },
  });
}

function formatMoney(symbol: string, amount: bigint | number): string {
  return `${symbol} **${amount.toLocaleString()}**`;
}

const balanceDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another user's balance")
    .addUserOption(o => o.setName("user").setDescription("User to check").setRequired(false)),
  async execute(interaction, services) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId!;
    const config = await services.config.get(guildId, "economy") as any ?? {};

    const user = await getOrCreateUser(services, guildId, target.id, config);
    const symbol = config.currencySymbol ?? "💰";
    const currencyName = config.currencyName ?? "Credits";
    const title = `${symbol} ${target.username}`;
    const body = [
      `**${symbol} Wallet** — ${user.balance.toLocaleString()}`,
      `**🏦 Bank** — ${user.bankBalance.toLocaleString()}`,
      `**📈 Total earned** — ${user.totalEarned.toLocaleString()}`,
      `**📉 Total spent** — ${user.totalSpent.toLocaleString()}`,
    ];
    const options = {
      subtitle: `${currencyName} • ${target.tag}`,
      thumbnailUrl: target.displayAvatarURL({ size: 256, extension: "png" }),
      footer: interaction.guild?.name ?? "Balance",
    };

    const cardData: BalanceCardData = {
      username: target.username,
      avatarUrl: target.displayAvatarURL({ size: 256, extension: "png" }),
      balance: user.balance.toString(),
      bankBalance: user.bankBalance.toString(),
      currencySymbol: symbol,
      currencyName,
      totalEarned: user.totalEarned.toString(),
      totalSpent: user.totalSpent.toString(),
    };

    let attachment: AttachmentBuilder | null = null;
    try {
      const { generateBalanceCard } = await import("./balanceCard.js");
      attachment = new AttachmentBuilder(await generateBalanceCard(cardData), { name: "balance.png" });
    } catch {}

    if (attachment) {
      await interaction.reply({
        ...ephemeralCard(makeCard(AccentColors.gold, title, body, {
          ...options,
          headerImages: ["attachment://balance.png"],
        })),
        files: [attachment],
      });
      return;
    }

    await interaction.reply(ephemeralCard(makeCard(AccentColors.gold, title, body, options)));
  },
};

const dailyDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward"),
  async execute(interaction, services) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";

    const user = await getOrCreateUser(services, guildId, userId, config);
    const now = new Date();

    if (user.lastDailyAt) {
      const diff = now.getTime() - new Date(user.lastDailyAt).getTime();
      if (diff < 24 * 60 * 60 * 1000) {
        const nextClaim = new Date(new Date(user.lastDailyAt).getTime() + 24 * 60 * 60 * 1000);
        await interaction.reply(ephemeralCard(makeErrorCard("Already claimed", [
          `**Next daily** — <t:${Math.floor(nextClaim.getTime() / 1000)}:R>`,
        ])));
        return;
      }
    }

    const amount = BigInt(config.dailyAmount ?? 100);
    await addBalance(services, guildId, userId, amount, "daily", "Daily reward");
    await services.db.prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: { lastDailyAt: now },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("Daily claimed", [
      `**Reward** — ${formatMoney(symbol, amount)}`,
      `**Next daily** — <t:${Math.floor((now.getTime() + 24 * 60 * 60 * 1000) / 1000)}:R>`,
    ])));
  },
};

const weeklyDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("weekly")
    .setDescription("Claim your weekly reward"),
  async execute(interaction, services) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";

    const user = await getOrCreateUser(services, guildId, userId, config);
    const now = new Date();

    if (user.lastWeeklyAt) {
      const diff = now.getTime() - new Date(user.lastWeeklyAt).getTime();
      if (diff < 7 * 24 * 60 * 60 * 1000) {
        const nextClaim = new Date(new Date(user.lastWeeklyAt).getTime() + 7 * 24 * 60 * 60 * 1000);
        await interaction.reply(ephemeralCard(makeErrorCard("Already claimed", [
          `**Next weekly** — <t:${Math.floor(nextClaim.getTime() / 1000)}:R>`,
        ])));
        return;
      }
    }

    const amount = BigInt(config.weeklyAmount ?? 500);
    await addBalance(services, guildId, userId, amount, "weekly", "Weekly reward");
    await services.db.prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: { lastWeeklyAt: now },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("Weekly claimed", [
      `**Reward** — ${formatMoney(symbol, amount)}`,
      `**Next weekly** — <t:${Math.floor((now.getTime() + 7 * 24 * 60 * 60 * 1000) / 1000)}:R>`,
    ])));
  },
};

const workDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Work for money"),
  async execute(interaction, services) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";

    const user = await getOrCreateUser(services, guildId, userId, config);
    const now = new Date();

    if (user.lastWorkAt) {
      const diff = now.getTime() - new Date(user.lastWorkAt).getTime();
      if (diff < (config.workCooldown ?? 3600) * 1000) {
        const nextWork = new Date(new Date(user.lastWorkAt).getTime() + (config.workCooldown ?? 3600) * 1000);
        await interaction.reply(ephemeralCard(makeErrorCard("On cooldown", [
          `**Next shift** — <t:${Math.floor(nextWork.getTime() / 1000)}:R>`,
        ])));
        return;
      }
    }

    const minPay = config.workMinPay ?? 50;
    const maxPay = config.workMaxPay ?? 200;
    const amount = BigInt(Math.floor(Math.random() * (maxPay - minPay + 1)) + minPay);

    await addBalance(services, guildId, userId, amount, "work", "Worked");
    await services.db.prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: { lastWorkAt: now },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("Work complete", [
      `**Earned** — ${formatMoney(symbol, amount)}`,
      `**Next shift** — <t:${Math.floor((now.getTime() + (config.workCooldown ?? 3600) * 1000) / 1000)}:R>`,
    ])));
  },
};

const transferDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Transfer money to another user")
    .addUserOption(o => o.setName("user").setDescription("User to pay").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to transfer").setMinValue(1).setRequired(true)),
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const amount = BigInt(interaction.options.getInteger("amount", true));
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";

    if (target.id === userId) {
      await interaction.reply(ephemeralCard(makeErrorCard("Invalid recipient", "You cannot pay yourself.")));
      return;
    }
    if (target.bot) {
      await interaction.reply(ephemeralCard(makeErrorCard("Invalid recipient", "You cannot pay bots.")));
      return;
    }

    const user = await getOrCreateUser(services, guildId, userId, config);
    if (user.balance < amount) {
      await interaction.reply(ephemeralCard(makeErrorCard("Insufficient funds", [
        `**Wallet** — ${formatMoney(symbol, user.balance)}`,
        `**Needed** — ${formatMoney(symbol, amount)}`,
      ])));
      return;
    }

    const taxRate = config.taxRate ?? 0;
    const tax = amount * BigInt(Math.floor(taxRate * 10000)) / 10000n;
    const netAmount = amount - tax;

    await addBalance(services, guildId, userId, -amount, "transfer_out", `Paid ${target.tag}`);
    await addBalance(services, guildId, target.id, netAmount, "transfer_in", `Received from ${interaction.user.tag}`);
    if (tax > 0) {
      await addBalance(services, guildId, userId, -tax, "tax", "Transfer tax");
    }

    await interaction.reply(ephemeralCard(makeSuccessCard("Payment sent", [
      `**Recipient** — ${target.tag}`,
      `**Sent** — ${formatMoney(symbol, amount)}`,
      ...(tax > 0 ? [`**Tax** — ${formatMoney(symbol, tax)}`, `**Received** — ${formatMoney(symbol, netAmount)}`] : []),
    ])));
  },
};

const depositDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Deposit money to bank")
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to deposit").setMinValue(1).setRequired(true)),
  async execute(interaction, services) {
    const amount = BigInt(interaction.options.getInteger("amount", true));
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";

    const user = await getOrCreateUser(services, guildId, userId, config);
    if (user.balance < amount) {
      await interaction.reply(ephemeralCard(makeErrorCard("Insufficient funds", [
        `**Wallet** — ${formatMoney(symbol, user.balance)}`,
        `**Needed** — ${formatMoney(symbol, amount)}`,
      ])));
      return;
    }

    await services.db.prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: { balance: { decrement: amount }, bankBalance: { increment: amount } },
    });

    await services.db.prisma.economyTransaction.create({
      data: { guildId, fromUserId: userId, amount, type: "deposit" },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("Deposited", [
      `**Amount** — ${formatMoney(symbol, amount)}`,
      `**Wallet** — ${formatMoney(symbol, user.balance - amount)}`,
      `**Bank** — ${formatMoney(symbol, user.bankBalance + amount)}`,
    ])));
  },
};

const withdrawDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw money from bank")
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to withdraw").setMinValue(1).setRequired(true)),
  async execute(interaction, services) {
    const amount = BigInt(interaction.options.getInteger("amount", true));
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";

    const user = await getOrCreateUser(services, guildId, userId, config);
    if (user.bankBalance < amount) {
      await interaction.reply(ephemeralCard(makeErrorCard("Insufficient funds", [
        `**Bank** — ${formatMoney(symbol, user.bankBalance)}`,
        `**Needed** — ${formatMoney(symbol, amount)}`,
      ])));
      return;
    }

    await services.db.prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: { balance: { increment: amount }, bankBalance: { decrement: amount } },
    });

    await services.db.prisma.economyTransaction.create({
      data: { guildId, toUserId: userId, amount, type: "withdraw" },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("Withdrawn", [
      `**Amount** — ${formatMoney(symbol, amount)}`,
      `**Wallet** — ${formatMoney(symbol, user.balance + amount)}`,
      `**Bank** — ${formatMoney(symbol, user.bankBalance - amount)}`,
    ])));
  },
};

const leaderboardDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("baltop")
    .setDescription("View the richest users")
    .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1).setRequired(false)),
  async execute(interaction, services) {
    const requestedPage = interaction.options.getInteger("page") ?? 1;
    const perPage = 10;
    const guildId = interaction.guildId!;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";

    const total = await services.db.prisma.economyUser.count({ where: { guildId } });
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(1, requestedPage), totalPages);

    const users = await services.db.prisma.economyUser.findMany({
      where: { guildId },
      orderBy: { balance: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    if (users.length === 0) {
      await interaction.reply(ephemeralCard(makeEmptyCard(
        "No economy data",
        "Nobody has earned currency in this server yet.",
        "Use `/daily` or `/work` to get started.",
      )));
      return;
    }

    const lines = users.map((u: any, i: number) => {
      const member = interaction.guild?.members.cache.get(u.userId);
      const name = member?.user.tag ?? `Unknown (${u.userId})`;
      return `**#${(page - 1) * perPage + i + 1}** ${name} — ${symbol} ${u.balance.toLocaleString()}`;
    });

    await interaction.reply(ephemeralCard(makeCard(AccentColors.gold, "🏆 Richest Users", lines, {
      subtitle: interaction.guild?.name,
      footer: formatPageFooter(page - 1, totalPages, total),
    })));
  },
};

const shopDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View the server shop")
    .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1).setRequired(false)),
  async execute(interaction, services) {
    const requestedPage = interaction.options.getInteger("page") ?? 1;
    const perPage = 4;
    const guildId = interaction.guildId!;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";
    const currencyName = config.currencyName ?? "Credits";

    const items = config.shopItems ?? [];
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const validPage = Math.min(Math.max(1, requestedPage), totalPages);

    const paginatedItems = items.slice((validPage - 1) * perPage, validPage * perPage);

    if (paginatedItems.length === 0) {
      await interaction.reply(ephemeralCard(makeEmptyCard(
        "Shop",
        "The shop is empty.",
        "An administrator can add items in the economy configuration.",
      )));
      return;
    }

    const lines = paginatedItems.map((item: any) =>
      `**${item.name}** — ${symbol} ${item.price.toLocaleString()} · ${item.type}\n-# ${item.description}`,
    );
    const options = {
      subtitle: `${interaction.guild!.name} · ${currencyName}`,
      thumbnailUrl: interaction.guild?.iconURL({ size: 256, extension: "png" }) ?? undefined,
      footer: formatPageFooter(validPage - 1, totalPages, items.length),
    };

    const shopItems: ShopItemData[] = paginatedItems.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      type: item.type,
      roleId: item.roleId,
      currencySymbol: symbol,
    }));

    const cardData: ShopCardData = {
      guildName: interaction.guild!.name,
      guildIconUrl: interaction.guild!.iconURL({ size: 256, extension: "png" }),
      currencyName,
      currencySymbol: symbol,
      items: shopItems,
      page: validPage,
      totalPages,
    };

    let attachment: AttachmentBuilder | null = null;
    try {
      const { generateShopCard } = await import("./shopCard.js");
      attachment = new AttachmentBuilder(await generateShopCard(cardData), { name: "shop.png" });
    } catch {}

    if (attachment) {
      await interaction.reply({
        ...ephemeralCard(makeListCard("🛒 Shop", lines, {
          ...options,
          headerImages: ["attachment://shop.png"],
        })),
        files: [attachment],
      });
      return;
    }

    await interaction.reply(ephemeralCard(makeListCard("🛒 Shop", lines, options)));
  },
};

const buyDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy an item from the shop")
    .addStringOption(o => o.setName("item").setDescription("Item ID to buy").setRequired(true).setAutocomplete(true)),
  async execute(interaction, services) {
    const itemId = interaction.options.getString("item", true);
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const symbol = config.currencySymbol ?? "💰";

    const item = (config.shopItems ?? []).find((i: any) => i.id === itemId);
    if (!item) {
      await interaction.reply(ephemeralCard(makeErrorCard("Item not found", "That item is not in the shop.")));
      return;
    }

    const user = await getOrCreateUser(services, guildId, userId, config);
    const price = BigInt(item.price);

    if (user.balance < price) {
      await interaction.reply(ephemeralCard(makeErrorCard("Insufficient funds", [
        `**Wallet** — ${formatMoney(symbol, user.balance)}`,
        `**Price** — ${formatMoney(symbol, price)}`,
      ])));
      return;
    }

    if (item.type === "role" && item.roleId) {
      const member = await interaction.guild!.members.fetch(userId).catch(() => null);
      const role = interaction.guild!.roles.cache.get(item.roleId);

      if (!role) {
        await interaction.reply(ephemeralCard(makeErrorCard("Role unavailable", "The role for this item no longer exists.")));
        return;
      }

      if (!member) {
        await interaction.reply(ephemeralCard(makeErrorCard("Member unavailable", "Could not resolve your server member record.")));
        return;
      }

      if (member.roles.cache.has(role.id)) {
        await interaction.reply(ephemeralCard(makeErrorCard("Already owned", "You already have this role.")));
        return;
      }

      await member.roles.add(role.id, "Shop purchase");
    }

    await addBalance(services, guildId, userId, -price, "shop_purchase", `Bought ${item.name}`);

    await interaction.reply(ephemeralCard(makeSuccessCard("Purchase complete", [
      `**Item** — ${item.name}`,
      `**Price** — ${formatMoney(symbol, price)}`,
      `**Wallet** — ${formatMoney(symbol, user.balance - price)}`,
    ])));
  },
  async autocomplete(interaction, services) {
    const focused = interaction.options.getFocused();
    const guildId = interaction.guildId!;
    const config = await services.config.get(guildId, "economy") as any ?? {};
    const items = config.shopItems ?? [];

    const choices = items
      .filter((item: any) => item.name.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map((item: any) => ({ name: `${item.name} (${config.currencySymbol ?? "💰"} ${item.price})`, value: item.id }));

    await interaction.respond(choices);
  },
};

const economyModule: ModuleDefinition = defineModule({
  name: "community-economy",
  displayName: "Economy",
  emoji: "💰",
  description: "Currency, banking, shop, jobs, and gambling",
  version: "2.0.0",
  config: EconomyConfigSchema,
  configFields: [
    { key: "currencyName", label: "Currency Name", type: "string", description: "Name of the currency" },
    { key: "currencySymbol", label: "Currency Symbol", type: "string", description: "Emoji or symbol" },
    { key: "startingBalance", label: "Starting Balance", type: "number", description: "Initial balance for new users" },
    { key: "dailyAmount", label: "Daily Reward", type: "number", description: "Amount for /daily" },
    { key: "weeklyAmount", label: "Weekly Reward", type: "number", description: "Amount for /weekly" },
    { key: "monthlyAmount", label: "Monthly Reward", type: "number", description: "Amount for /monthly" },
    { key: "interestRate", label: "Bank Interest Rate", type: "number", description: "Daily interest (0.01 = 1%)" },
    { key: "taxRate", label: "Transaction Tax", type: "number", description: "Tax on transfers (0.05 = 5%)" },
    { key: "workCooldown", label: "Work Cooldown (seconds)", type: "number", description: "Seconds between /work" },
    { key: "workMinPay", label: "Work Min Pay", type: "number", description: "Minimum /work payout" },
    { key: "workMaxPay", label: "Work Max Pay", type: "number", description: "Maximum /work payout" },
  ],
  commands: [balanceDef, dailyDef, weeklyDef, workDef, transferDef, depositDef, withdrawDef, leaderboardDef, shopDef, buyDef],
  listeners: [],
  tasks: [],
  async onLoad(_services) {
    console.log("[economy] Module loaded");
    return [];
  },
  async onUnload(_services) {
    console.log("[economy] Module unloaded");
  },
});

export default economyModule;
