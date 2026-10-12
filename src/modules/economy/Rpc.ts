import { container } from "#src/lib/Services.js";
import { economyRpc } from "#src/contracts/rpc/Index.ts";
import { implementRpc } from "#src/lib/rpc/Implement.js";
import { resolvePageSize } from "#src/lib/rpc/Validation.js";
import { BankService } from "#src/modules/economy/services/BankService.js";
import { getEconomyConfig } from "#src/modules/economy/Config.js";

export const economyRpcHandlers = implementRpc(economyRpc, {
  "guild.economy.balance": async ({ guildId, input }) => {
    const config = await getEconomyConfig(container, guildId);
    const balance = await new BankService(container.db.economy).getBalance(
      guildId,
      input.userId,
      config,
    );
    return { wallet: balance.wallet, bank: balance.bank, total: balance.total };
  },

  "guild.economy.leaderboard": async ({ guildId, input }) => {
    const { pageSize, take } = resolvePageSize(input);
    const { entries, total } = await new BankService(
      container.db.economy,
    ).leaderboard(guildId, take);
    return { entries, total, pageSize };
  },

  "guild.economy.adjust": async ({ guildId, actorId, input }) => {
    const config = await getEconomyConfig(container, guildId);
    const balance = await new BankService(container.db.economy).adjust(
      guildId,
      input.userId,
      input.operation,
      input.amount,
      input.vault,
      `dashboard: ${input.reason}`,
      actorId,
      config,
    );
    return {
      success: true,
      wallet: balance.wallet,
      bank: balance.bank,
      total: balance.total,
    };
  },
});
