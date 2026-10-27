

export interface EconomyUserRecord {
  userId: string;
  balance: bigint;
  bankBalance: bigint;
  totalEarned: bigint;
  totalSpent: bigint;
  lastDailyAt?: Date;
  lastWeeklyAt?: Date;
  lastMonthlyAt?: Date;
  lastWorkAt?: Date;
}

export interface EconomyConfigRecord {
  currencyName: string;
  currencySymbol: string;
  startingBalance: number;
  dailyAmount: number;
  weeklyAmount: number;
  monthlyAmount: number;
  interestRate: number;
  taxRate: number;
  workCooldown: number;
  workMinPay: number;
  workMaxPay: number;
  shopItems: any[];
}

export async function getOrCreateUser(services: any, guildId: string, userId: string, config: EconomyConfigRecord): Promise<EconomyUserRecord> {
  const user = await services.db.prisma.economyUser.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {},
    create: { 
      guildId, 
      userId, 
      balance: BigInt(config.startingBalance),
      bankBalance: BigInt(0),
    },
  });
  
  return {
    userId: user.userId,
    balance: user.balance,
    bankBalance: user.bankBalance,
    totalEarned: user.totalEarned,
    totalSpent: user.totalSpent,
    lastDailyAt: user.lastDailyAt ?? undefined,
    lastWeeklyAt: user.lastWeeklyAt ?? undefined,
    lastMonthlyAt: user.lastMonthlyAt ?? undefined,
    lastWorkAt: user.lastWorkAt ?? undefined,
  };
}

export async function addBalance(services: any, guildId: string, userId: string, amount: bigint, type: string, description?: string): Promise<void> {
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

export async function transferBalance(services: any, guildId: string, fromId: string, toId: string, amount: bigint, config: EconomyConfigRecord): Promise<{ success: boolean; tax?: bigint; error?: string }> {
  if (fromId === toId) {
    return { success: false, error: "Cannot transfer to yourself" };
  }
  
  const fromUser = await services.db.prisma.economyUser.findUnique({
    where: { guildId_userId: { guildId, userId: fromId } },
  });
  
  if (!fromUser || fromUser.balance < amount) {
    return { success: false, error: "Insufficient funds" };
  }
  
  const taxRate = config.taxRate ?? 0;
  const tax = amount * BigInt(Math.floor(taxRate * 10000)) / 10000n;
  const netAmount = amount - tax;
  
  await services.db.prisma.$transaction([
    services.db.prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId: fromId } },
      data: { balance: { decrement: amount } },
    }),
    services.db.prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId: toId } },
      data: { balance: { increment: netAmount } },
    }),
    services.db.prisma.economyTransaction.create({
      data: { guildId, fromUserId: fromId, amount, type: "transfer_out", description: `Sent to ${toId}` },
    }),
    services.db.prisma.economyTransaction.create({
      data: { guildId, toUserId: toId, amount: netAmount, type: "transfer_in", description: `Received from ${fromId}` },
    }),
  ]);
  
  if (tax > 0) {
    await services.db.prisma.economyTransaction.create({
      data: { guildId, fromUserId: fromId, amount: tax, type: "tax", description: "Transfer tax" },
    });
  }
  
  return { success: true, tax };
}

export async function depositToBank(services: any, guildId: string, userId: string, amount: bigint): Promise<void> {
  const user = await services.db.prisma.economyUser.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  
  if (!user || user.balance < amount) {
    throw new Error("Insufficient funds");
  }
  
  await services.db.prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { balance: { decrement: amount }, bankBalance: { increment: amount } },
  });
  
  await services.db.prisma.economyTransaction.create({
    data: { guildId, fromUserId: userId, amount, type: "deposit" },
  });
}

export async function withdrawFromBank(services: any, guildId: string, userId: string, amount: bigint): Promise<void> {
  const user = await services.db.prisma.economyUser.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  
  if (!user || user.bankBalance < amount) {
    throw new Error("Insufficient funds in bank");
  }
  
  await services.db.prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { balance: { increment: amount }, bankBalance: { decrement: amount } },
  });
  
  await services.db.prisma.economyTransaction.create({
    data: { guildId, toUserId: userId, amount, type: "withdraw" },
  });
}

export async function claimDaily(services: any, guildId: string, userId: string, config: EconomyConfigRecord): Promise<{ success: boolean; amount?: bigint; nextClaim?: Date; error?: string }> {
  const user = await getOrCreateUser(services, guildId, userId, config);
  const now = new Date();
  
  if (user.lastDailyAt) {
    const diff = now.getTime() - new Date(user.lastDailyAt).getTime();
    if (diff < 24 * 60 * 60 * 1000) {
      const nextClaim = new Date(new Date(user.lastDailyAt).getTime() + 24 * 60 * 60 * 1000);
      return { success: false, nextClaim };
    }
  }
  
  const amount = BigInt(config.dailyAmount ?? 100);
  await addBalance(services, guildId, userId, amount, "daily", "Daily reward");
  
  await services.db.prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { lastDailyAt: now },
  });
  
  return { success: true, amount };
}

export async function claimWeekly(services: any, guildId: string, userId: string, config: EconomyConfigRecord): Promise<{ success: boolean; amount?: bigint; nextClaim?: Date; error?: string }> {
  const user = await getOrCreateUser(services, guildId, userId, config);
  const now = new Date();
  
  if (user.lastWeeklyAt) {
    const diff = now.getTime() - new Date(user.lastWeeklyAt).getTime();
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const nextClaim = new Date(new Date(user.lastWeeklyAt).getTime() + 7 * 24 * 60 * 60 * 1000);
      return { success: false, nextClaim };
    }
  }
  
  const amount = BigInt(config.weeklyAmount ?? 500);
  await addBalance(services, guildId, userId, amount, "weekly", "Weekly reward");
  
  await services.db.prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { lastWeeklyAt: now },
  });
  
  return { success: true, amount };
}

export async function work(services: any, guildId: string, userId: string, config: EconomyConfigRecord): Promise<{ success: boolean; amount?: bigint; nextWork?: Date; error?: string }> {
  const user = await getOrCreateUser(services, guildId, userId, config);
  const now = new Date();
  
  if (user.lastWorkAt) {
    const diff = now.getTime() - new Date(user.lastWorkAt).getTime();
    const cooldown = (config.workCooldown ?? 3600) * 1000;
    if (diff < cooldown) {
      const nextWork = new Date(new Date(user.lastWorkAt).getTime() + cooldown);
      return { success: false, nextWork };
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
  
  return { success: true, amount };
}

export async function getLeaderboard(services: any, guildId: string, page: number = 1, perPage: number = 10): Promise<{ users: any[]; total: number; totalPages: number }> {
  const users = await services.db.prisma.economyUser.findMany({
    where: { guildId },
    orderBy: { balance: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
  });
  
  const total = await services.db.prisma.economyUser.count({ where: { guildId } });
  
  return { users, total, totalPages: Math.ceil(total / perPage) };
}