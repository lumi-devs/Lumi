import { describe, it, expect, vi, beforeEach } from "vitest";
import { EconomyRepository } from "#lib/prisma/repositories/EconomyRepository.js";
import {
  BankService,
  CooldownError,
  EconomyLimitError,
  InsufficientFundsError,
  InvalidAmountError,
} from "#modules/economy/services/BankService.js";
import type { EconomyConfig } from "#modules/economy/index.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

vi.mock("@sapphire/framework", () => ({ container: {} }));

function makeConfig(overrides: Partial<EconomyConfig> = {}): EconomyConfig {
  return {
    currencyName: "credits",
    currencyEmoji: "🪙",
    startingWallet: 100,
    startingBank: 0,
    maxBalance: 1000000,
    paydayAmount: 120,
    paydayCooldownMs: 5 * 60 * 1000,
    transferTaxPercent: 0,
    slotMinBid: 5,
    slotMaxBid: 100,
    slotCooldownMs: 0,
    slotDailyCap: 1000,
    slotPayouts: {
      jackpot: 50,
      cloverThree: 25,
      cherriesThree: 20,
      twoSix: 4,
      cherriesTwo: 3,
      threeKind: 10,
      twoKind: 2,
    },
    ...overrides,
  };
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe("BankService", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: EconomyRepository;
  let bank: BankService;
  let config: EconomyConfig;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    const mockDb = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    repo = new EconomyRepository(
      prisma as never,
      {} as never,
      mockLogger as never,
      mockDb as never,
    );
    bank = new BankService(repo);
    config = makeConfig();
  });

  it("grants starting balances to a new account", async () => {
    const balance = await bank.getBalance("g1", "u1", config);
    expect(balance).toMatchObject({ wallet: 100, bank: 0, total: 100 });
  });

  it("pays payday once then enforces the cooldown", async () => {
    const now = new Date("2026-09-06T12:00:00Z");
    const first = await bank.payday("g1", "u1", config, now);
    expect(first.amount).toBe(120);
    expect(first.balance.total).toBe(220);

    await expect(bank.payday("g1", "u1", config, now)).rejects.toBeInstanceOf(
      CooldownError,
    );

    const later = new Date(now.getTime() + config.paydayCooldownMs + 1000);
    const second = await bank.payday("g1", "u1", config, later);
    expect(second.amount).toBe(120);

    const rows = prisma.$all("economyTransaction");
    expect(rows.filter((r) => r["kind"] === "payday")).toHaveLength(2);
  });

  it("caps payday at the server maximum balance", async () => {
    const capped = makeConfig({ maxBalance: 1000, paydayAmount: 5000 });
    const now = new Date("2026-09-06T12:00:00Z");
    const result = await bank.payday("g1", "u1", capped, now);
    expect(result.capped).toBe(true);
    expect(result.balance.total).toBe(1000);
  });

  it("moves wallet to bank and back with ledger rows", async () => {
    await bank.deposit("g1", "u1", 60, config);
    const afterDeposit = await bank.getBalance("g1", "u1", config);
    expect(afterDeposit).toMatchObject({ wallet: 40, bank: 60, total: 100 });

    await bank.withdraw("g1", "u1", 25, config);
    const afterWithdraw = await bank.getBalance("g1", "u1", config);
    expect(afterWithdraw).toMatchObject({ wallet: 65, bank: 35, total: 100 });

    const kinds = prisma
      .$all("economyTransaction")
      .map((r) => r["kind"])
      .sort();
    expect(kinds).toEqual(["deposit", "withdraw"]);
  });

  it("rejects deposits beyond the wallet balance", async () => {
    await expect(bank.deposit("g1", "u1", 500, config)).rejects.toBeInstanceOf(
      InsufficientFundsError,
    );
    await expect(
      bank.withdraw("g1", "u1", 10, config),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
  });

  it("transfers with floor tax math and paired ledger rows", async () => {
    const taxed = makeConfig({ transferTaxPercent: 10 });
    const result = await bank.transfer("g1", "u1", "u2", 99, taxed);
    expect(result).toEqual({ sent: 99, fee: 9, received: 90 });

    const sender = await bank.getBalance("g1", "u1", taxed);
    const recipient = await bank.getBalance("g1", "u2", taxed);
    expect(sender.wallet).toBe(1);
    expect(recipient.wallet).toBe(100 + 90);

    const rows = prisma.$all("economyTransaction");
    const out = rows.find((r) => r["kind"] === "transfer_out")!;
    const inn = rows.find((r) => r["kind"] === "transfer_in")!;
    expect(out["amount"]).toBe(-99);
    expect(out["balanceAfter"]).toBe(1);
    expect(inn["amount"]).toBe(90);
    expect(inn["balanceAfter"]).toBe(190);
    expect(String(out["reason"])).toContain("tax 9 burned");
  });

  it("rejects self transfers and non-positive amounts", async () => {
    await expect(bank.transfer("g1", "u1", "u1", 10, config)).rejects.toBeInstanceOf(
      InvalidAmountError,
    );
    await expect(bank.transfer("g1", "u1", "u2", 0, config)).rejects.toBeInstanceOf(
      InvalidAmountError,
    );
    await expect(bank.transfer("g1", "u1", "u2", 500, config)).rejects.toBeInstanceOf(
      InsufficientFundsError,
    );
  });

  it("serializes concurrent transfers so the second overdraft fails", async () => {
    const attempts = await Promise.allSettled([
      bank.transfer("g1", "u1", "u2", 80, config),
      bank.transfer("g1", "u1", "u3", 80, config),
    ]);
    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(InsufficientFundsError);

    const sender = await bank.getBalance("g1", "u1", config);
    expect(sender.wallet).toBe(20);
    const outs = prisma
      .$all("economyTransaction")
      .filter((r) => r["kind"] === "transfer_out");
    expect(outs).toHaveLength(1);
  });

  it("supports admin add, remove, and set with audited reasons", async () => {
    await bank.adjust("g1", "u1", "add", 500, "wallet", "event prize", "mod1", config);
    let balance = await bank.getBalance("g1", "u1", config);
    expect(balance.wallet).toBe(600);

    await bank.adjust("g1", "u1", "remove", 1000, "wallet", "rule violation", "mod1", config);
    balance = await bank.getBalance("g1", "u1", config);
    expect(balance.wallet).toBe(0);

    await bank.adjust("g1", "u1", "set", 250, "bank", "correction", "mod1", config);
    balance = await bank.getBalance("g1", "u1", config);
    expect(balance.bank).toBe(250);

    const rows = prisma.$all("economyTransaction");
    expect(rows.map((r) => r["kind"]).sort()).toEqual([
      "admin_add",
      "admin_remove",
      "admin_set",
    ]);
    for (const row of rows) {
      expect(String(row["reason"])).toContain("mod1");
    }
  });

  it("enforces the slots daily wager cap from the ledger", async () => {
    const limited = makeConfig({ slotDailyCap: 100 });
    prisma.$seed("economyAccount", [
      { guildId: "g1", userId: "u1", wallet: 500, bank: 0, lastPaydayAt: null },
    ]);
    prisma.$seed("economyTransaction", [
      {
        id: 1,
        guildId: "g1",
        userId: "u1",
        kind: "slots_bid",
        amount: -90,
        balanceAfter: 410,
        reason: "slots",
        createdAt: new Date("2026-09-06T08:00:00Z"),
      },
    ]);
    await expect(
      bank.playSlots("g1", "u1", 20, limited, () => 0.99, new Date("2026-09-06T12:00:00Z")),
    ).rejects.toBeInstanceOf(EconomyLimitError);
  });

  it("settles a losing slots pull with a single bid ledger row", async () => {
    const rolls = [0.01, 0.15, 0.25];
    let call = 0;
    const losing = () => rolls[call++ % rolls.length]!;
    const result = await bank.playSlots("g1", "u1", 10, config, losing);
    expect(result.won).toBe(false);
    expect(result.balanceAfter).toBe(90);
    const rows = prisma.$all("economyTransaction");
    expect(rows.map((r) => r["kind"])).toEqual(["slots_bid"]);
    expect(rows[0]!["balanceAfter"]).toBe(90);
  });

  it("ranks the leaderboard by wallet plus bank", async () => {
    prisma.$seed("economyAccount", [
      { guildId: "g1", userId: "u1", wallet: 10, bank: 10, lastPaydayAt: null },
      { guildId: "g1", userId: "u2", wallet: 0, bank: 500, lastPaydayAt: null },
      { guildId: "g1", userId: "u3", wallet: 300, bank: 0, lastPaydayAt: null },
      { guildId: "other", userId: "u9", wallet: 9999, bank: 0, lastPaydayAt: null },
    ]);
    const { entries, total } = await bank.leaderboard("g1", 10);
    expect(total).toBe(3);
    expect(entries.map((e) => e.userId)).toEqual(["u2", "u3", "u1"]);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });
});
