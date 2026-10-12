import type { Container } from "#src/lib/Services.js";
import {
  defineModuleConfig,
  type ConfigScope,
  type ScopedConfig,
} from "#src/lib/module-system/ModuleConfig.js";
import * as bank from "#src/lib/api/economy/Bank.js";
import * as levels from "#src/lib/api/economy/Levels.js";
import { isFlagEnabled } from "#src/lib/flags/Index.js";
import {
  deleteModuleFile,
  ensureModuleFilesDir,
  listModuleFiles,
  readModuleFile,
  writeModuleFile,
} from "#src/lib/module-system/ModuleFiles.js";
import { authorize } from "#src/lib/api/permissions/Authorize.js";
import {
  explainPermit,
  type PermitTierExplanation,
} from "#src/lib/api/permissions/PermitResolver.js";
import { scheduleOneshot } from "#src/lib/scheduler/Oneshot.js";
import { UserError } from "#src/shared/Index.ts";
import {
  makeErrorCard,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "#src/lib/ui/Cards.js";
import * as fmt from "#src/lib/ui/Format.js";
import { AntiSpam, type AntiSpamInterval } from "#src/lib/utilities/Antispam.js";

export interface ModuleActor {
  userId: string;
  roleIds?: readonly string[];
  channelId?: string;
  guildOwnerId?: string | null;
}

export interface ModulePermits {
  allows(node: string, actor: ModuleActor): Promise<boolean>;
  check(node: string, actor: ModuleActor): Promise<void>;
  explain(node: string, actor: ModuleActor): Promise<PermitTierExplanation[]>;
}

export interface ModuleLevels {
  account(userId: string): Promise<levels.LevelAccount>;
  addXp(userId: string, amount: number): Promise<levels.LevelAccount>;
  removeXp(userId: string, amount: number): Promise<levels.LevelAccount>;
  addLevels(userId: string, amount: number): Promise<levels.LevelAccount>;
  removeLevels(userId: string, amount: number): Promise<levels.LevelAccount>;
  setLevel(userId: string, level: number, xp?: number): Promise<levels.LevelAccount>;
  board(board: levels.BoardKind, limit?: number, offset?: number): Promise<{ entries: levels.BoardEntry[]; total: number }>;
  rankOf(userId: string): Promise<number | null>;
}
export interface ModuleBank {
  balance(userId: string): Promise<bank.BankBalance>;
  deposit(userId: string, amount: number): Promise<bank.BankBalance>;
  withdraw(userId: string, amount: number): Promise<bank.BankBalance>;
  transfer(fromUserId: string, toUserId: string, amount: number): Promise<{ sent: number; fee: number; received: number }>;
  withCost<T>(userId: string, amount: number, run: () => Promise<T>): Promise<T>;
  cost(amount: number): <T>(userId: string, run: () => Promise<T>) => Promise<T>;
  leaderboard(limit?: number): Promise<{ entries: bank.LeaderboardEntry[]; total: number }>;
  position(userId: string): Promise<number | null>;
  prune(): Promise<number>;
  account(userId: string): Promise<bank.BankAccountView>;
  currencyName(): Promise<string>;
  bankName(): Promise<string>;
}

export interface ModuleUi {
  success(title: string, body?: string): CardReply;
  error(title: string, body?: string): CardReply;
  info(title: string, body?: string): CardReply;
  warning(title: string, body?: string): CardReply;
  list(title: string, items: readonly string[]): CardReply;
}

export interface ModuleKv {
  get<T = unknown>(targetId: string, key: string): Promise<T | null>;
  set<T = unknown>(targetId: string, key: string, value: T, opts?: { ttlMs?: number }): Promise<void>;
  del(targetId: string, key: string): Promise<void>;
}

export interface ModuleFiles {
  dir(): Promise<string>;
  read(name: string): Promise<Buffer | null>;
  write(name: string, data: string | Uint8Array): Promise<string>;
  del(name: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

export interface ModuleApi<D extends Record<string, unknown>> {
  readonly moduleName: string;
  readonly guildId: string;
  readonly config: ScopedConfig<D>;
  configFor(scope: ConfigScope): ScopedConfig<D>;
  readonly bank: ModuleBank;
  readonly levels: ModuleLevels;
  readonly permits: ModulePermits;
  readonly ui: ModuleUi;
  readonly fmt: typeof fmt;
  readonly tokens: { get(service: string): Promise<string | null> };
  readonly kv: ModuleKv;
  readonly files: ModuleFiles;
  flag(key: string): Promise<boolean>;
  later(name: string, delayMs: number, data?: unknown): Promise<void>;
  spam(key: string, intervals: AntiSpamInterval | AntiSpamInterval[]): AntiSpam;
}

export function createModuleApi<D extends Record<string, unknown>>(
  services: Container,
  moduleName: string,
  defaults: D,
  guildId: string,
): ModuleApi<D> {
  const defined = defineModuleConfig(moduleName, defaults);
  const config = defined.forGuild(services, guildId);
  const toSubject = (actor: ModuleActor) => ({
    userId: actor.userId,
    guildId,
    guildOwnerId: actor.guildOwnerId,
    roleIds: actor.roleIds,
    channelId: actor.channelId,
  });
  return {
    moduleName,
    guildId,
    config,
    configFor: (scope) => defined.forScope(services, guildId, scope),
    bank: {
      balance: (userId) => bank.getBalance(services, guildId, userId),
      deposit: (userId, amount) => bank.deposit(services, guildId, userId, amount),
      withdraw: (userId, amount) => bank.withdraw(services, guildId, userId, amount),
      transfer: (fromUserId, toUserId, amount) =>
        bank.transfer(services, guildId, fromUserId, toUserId, amount),
      withCost: (userId, amount, run) => bank.withCost(services, guildId, userId, amount, run),
      cost: (amount) => <T>(userId: string, run: () => Promise<T>) =>
        bank.withCost(services, guildId, userId, amount, run),
      leaderboard: (limit) => bank.getLeaderboard(services, guildId, limit),
      position: (userId) => bank.getLeaderboardPosition(services, guildId, userId),
      prune: () => bank.bankPrune(services, guildId),
      account: (userId) => bank.account(services, guildId, userId),
      currencyName: () => bank.currencyName(services, guildId),
      bankName: () => bank.bankName(services, guildId),
    },
    levels: {
      account: (userId) => levels.getAccount(services, guildId, userId),
      addXp: (userId, amount) => levels.addXp(services, guildId, userId, amount),
      removeXp: (userId, amount) => levels.removeXp(services, guildId, userId, amount),
      addLevels: (userId, amount) => levels.addLevels(services, guildId, userId, amount),
      removeLevels: (userId, amount) => levels.removeLevels(services, guildId, userId, amount),
      setLevel: (userId, level, xp) => levels.setLevel(services, guildId, userId, level, xp),
      board: (board, limit, offset) => levels.getBoard(services, guildId, board, limit, offset),
      rankOf: (userId) => levels.getRank(services, guildId, userId),
    },
    permits: {
      allows: (node, actor) =>
        authorize(toSubject(actor), { kind: "permit", node }),
      check: async (node, actor) => {
        const ok = await authorize(toSubject(actor), { kind: "permit", node });
        if (!ok) {
          throw new UserError({
            identifier: "PermissionDenied",
            message: `You lack the required permit (\`${node}\`) to use this.`,
          });
        }
      },
      explain: (node, actor) =>
        explainPermit(node, {
          guildId,
          userId: actor.userId,
          roleIds: actor.roleIds ? [...actor.roleIds] : undefined,
          channelId: actor.channelId,
          guildOwnerId: actor.guildOwnerId,
        }),
    },
    ui: {
      success: (title, body) => makeSuccessCard(title, body ?? ""),
      error: (title, body) => makeErrorCard(title, body ?? ""),
      info: (title, body) => makeInfoCard(title, body ?? ""),
      warning: (title, body) => makeWarningCard(title, body ?? ""),
      list: (title, items) => makeListCard(title, [...items]),
    },
    fmt,
    tokens: {
      get: (service) => services.db.sharedTokens.getToken(service),
    },
    kv: {
      get: (targetId, key) => services.db.guildKV.getModuleData(guildId, moduleName, targetId, key),
      set: (targetId, key, value, opts) =>
        services.db.guildKV.setModuleData(guildId, moduleName, targetId, key, value, opts),
      del: async (targetId, key) => {
        await services.db.guildKV.deleteModuleData(guildId, moduleName, targetId, key);
      },
    },
    files: {
      dir: () => ensureModuleFilesDir(moduleName),
      read: (name) => readModuleFile(moduleName, name),
      write: (name, data) => writeModuleFile(moduleName, name, data),
      del: (name) => deleteModuleFile(moduleName, name),
      list: (prefix) => listModuleFiles(moduleName, prefix ?? ""),
    },
    flag: (key) => isFlagEnabled(services, key, guildId),
    later: (name, delayMs, data) =>
      scheduleOneshot(services, moduleName, name, guildId, delayMs, data),
    spam: (key, intervals) => new AntiSpam(services, `${moduleName}:${key}`, intervals),
  };
}
