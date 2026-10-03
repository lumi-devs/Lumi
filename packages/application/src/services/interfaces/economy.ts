export interface AccountBalance {
  wallet: number;
  bank: number;
  total: number;
}

export interface LeaderboardEntry {
  userId: string;
  wallet: number;
  bank: number;
  total: number;
  rank: number;
}

export interface SlotSpinOutcome {
  bid: number;
  pay: number;
  net: number;
  won: boolean;
  payoutKey: string;
  multiplier: number;
  balanceAfter: AccountBalance;
}

export interface IBankService {
  getBalance(guildId: string, userId: string): Promise<AccountBalance>;
  deposit(guildId: string, userId: string, amount: number): Promise<AccountBalance>;
  withdraw(guildId: string, userId: string, amount: number): Promise<AccountBalance>;
  transfer(guildId: string, senderId: string, recipientId: string, amount: number): Promise<{ sender: AccountBalance; recipient: AccountBalance }>;
  payday(guildId: string, userId: string): Promise<{ balance: AccountBalance; earned: number; nextPaydayAt: number }>;
  slots(guildId: string, userId: string, bid: number): Promise<SlotSpinOutcome>;
  leaderboard(guildId: string, limit: number, offset?: number): Promise<{ entries: LeaderboardEntry[]; total: number }>;
}
