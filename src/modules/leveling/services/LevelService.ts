import { container } from "#src/lib/Services.js";
import type { LevelBalance } from "#src/modules/leveling/data/LevelRepository.js";
import {
  PermissionsBitField,
  type Guild,
  type GuildMember,
  type TextBasedChannel,
} from "discord.js";
import type { LevelRepository } from "#src/modules/leveling/data/LevelRepository.js";
import type { LevelBoardEntry } from "#src/modules/leveling/data/LevelRepository.js";
import {
  applyMultipliers,
  type LevelingConfig,
} from "#src/modules/leveling/Config.js";
import {
  levelForTotalXp,
  totalXpForLevel,
  xpForLevel,
} from "#src/modules/leveling/services/Formulas.js";

export class LevelError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface LevelUpResult {
  account: LevelBalance;
  granted: boolean;
  levelsGained: number;
}

export type BoardKind = "overall" | "voice" | "weekly" | "monthly";

export const BoardKinds: readonly BoardKind[] = [
  "overall",
  "voice",
  "weekly",
  "monthly",
];

export function isBoardKind(value: unknown): value is BoardKind {
  return (
    typeof value === "string" &&
    (BoardKinds as readonly string[]).includes(value)
  );
}

export interface BoardEntry {
  userId: string;
  rank: number;
  level: number;
  xp: number;
  totalXp: number;
  messageCount: number;
  voiceMinutes: number;
  windowTotal: number | null;
}

export interface GrantContext {
  announceChannel?: TextBasedChannel | null;
  member?: GuildMember | null;
}

const voiceSessions = new Map<string, number>();

function sessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function renderAnnouncement(
  template: string,
  member: GuildMember,
  account: LevelBalance,
  xpNeeded: number,
): string {
  return template
    .split("{user}")
    .join(`<@${member.id}>`)
    .split("{level}")
    .join(String(account.level))
    .split("{xp}")
    .join(String(account.xp))
    .split("{xpNeeded}")
    .join(String(xpNeeded));
}

export class LevelService {
  public constructor(
    private readonly store: LevelRepository = container.db.leveling,
  ) {}

  public async grantMessage(
    guildId: string,
    userId: string,
    roleIds: string[],
    channelId: string,
    config: LevelingConfig,
    ctx: GrantContext = {},
    now: Date = new Date(),
  ): Promise<LevelUpResult> {
    const amount = applyMultipliers(
      config.messageXp,
      config,
      roleIds,
      channelId,
    );
    const { account, granted, levelsGained } = await this.store.awardXp({
      guildId,
      userId,
      amount,
      formula: config.formula,
      notBefore: new Date(now.getTime() - config.messageCooldownMs),
      now,
      countMessage: true,
    });
    if (levelsGained > 0 && ctx.member) {
      await this.onLevelUp(ctx.member, account, config, ctx.announceChannel);
    }
    return { account, granted, levelsGained };
  }

  public async grantVoice(
    guild: Guild,
    member: GuildMember,
    minutes: number,
    config: LevelingConfig,
  ): Promise<LevelUpResult> {
    const amount = applyMultipliers(
      config.voiceXpPerMinute * minutes,
      config,
      [...member.roles.cache.keys()],
      member.voice.channelId,
    );
    const { account, levelsGained } = await this.store.awardVoice({
      guildId: guild.id,
      userId: member.id,
      minutes,
      amount,
      formula: config.formula,
    });
    if (levelsGained > 0) {
      await this.onLevelUp(member, account, config, null);
    }
    return { account, granted: true, levelsGained };
  }

  public voiceSessionStart(
    guildId: string,
    userId: string,
    nowMs: number,
  ): void {
    voiceSessions.set(sessionKey(guildId, userId), nowMs);
  }

  public voiceSessionEnd(
    guildId: string,
    userId: string,
    nowMs: number,
  ): number | null {
    const key = sessionKey(guildId, userId);
    const started = voiceSessions.get(key);
    if (started === undefined) return null;
    voiceSessions.delete(key);
    return Math.max(0, nowMs - started);
  }

  public async adjustXp(
    guildId: string,
    userId: string,
    delta: number,
    config: LevelingConfig,
  ): Promise<LevelBalance> {
    if (!Number.isInteger(delta)) {
      throw new LevelError("InvalidAmount", "Amount must be a whole number.");
    }
    const current = await this.store.ensureAccount(guildId, userId);
    const before =
      totalXpForLevel(config.formula, current.level) + current.xp;
    const total = Math.max(0, before + delta);
    const { level, xp } = levelForTotalXp(config.formula, total);
    const account = await this.store.setLevelXp(guildId, userId, level, xp, total);
    if (total !== before) {
      await this.store
        .recordGain(guildId, userId, total - before, "admin")
        .catch(() => null);
    }
    return account;
  }

  public async adjustLevels(
    guildId: string,
    userId: string,
    delta: number,
    config: LevelingConfig,
  ): Promise<LevelBalance> {
    if (!Number.isInteger(delta)) {
      throw new LevelError("InvalidAmount", "Amount must be a whole number.");
    }
    const current = await this.store.ensureAccount(guildId, userId);
    const before =
      totalXpForLevel(config.formula, current.level) + current.xp;
    const level = Math.min(
      1000,
      Math.max(1, current.level + delta),
    );
    const after = totalXpForLevel(config.formula, level) + current.xp;
    const account = await this.store.setLevelXp(
      guildId,
      userId,
      level,
      current.xp,
      after,
    );
    if (after !== before) {
      await this.store
        .recordGain(guildId, userId, after - before, "admin")
        .catch(() => null);
    }
    return account;
  }

  public async setLevel(
    guildId: string,
    userId: string,
    level: number,
    xp: number,
    config: LevelingConfig,
  ): Promise<LevelBalance> {
    if (!Number.isInteger(level) || level < 1) {
      throw new LevelError("InvalidAmount", "Level must be 1 or higher.");
    }
    if (!Number.isInteger(xp) || xp < 0) {
      throw new LevelError("InvalidAmount", "XP must be 0 or higher.");
    }
    const needed = xpForLevel(config.formula, level);
    const clamped = Math.min(xp, needed - 1);
    const current = await this.store.findAccount(guildId, userId);
    const before = current
      ? totalXpForLevel(config.formula, current.level) + current.xp
      : 0;
    const after = totalXpForLevel(config.formula, level) + clamped;
    const account = await this.store.setLevelXp(
      guildId,
      userId,
      level,
      clamped,
      after,
    );
    if (after !== before) {
      await this.store
        .recordGain(guildId, userId, after - before, "admin")
        .catch(() => null);
    }
    return account;
  }

  public async restoreEarnedRoles(
    member: GuildMember,
    config: LevelingConfig,
  ): Promise<void> {
    const account = await this.store.findAccount(
      member.guild.id,
      member.id,
    );
    if (!account) return;
    await this.applyRoleRewards(member, account.level, config);
  }

  public async board(
    guildId: string,
    board: BoardKind,
    config: LevelingConfig,
    limit: number,
    offset = 0,
  ): Promise<{ entries: BoardEntry[]; total: number }> {
    const safeLimit = Math.min(10, Math.max(1, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor(offset));
    if (board === "voice") {
      return this.accountBoard(
        guildId,
        config,
        safeLimit,
        safeOffset,
        (store, gid, lim, off) => store.rankedByVoice(gid, lim, off),
      );
    }
    if (board === "weekly" || board === "monthly") {
      return this.windowBoard(guildId, board, config, safeLimit, safeOffset);
    }
    return this.accountBoard(
      guildId,
      config,
      safeLimit,
      safeOffset,
      (store, gid, lim, off) => store.rankedAccounts(gid, lim, off),
    );
  }

  private async accountBoard(
    guildId: string,
    config: LevelingConfig,
    limit: number,
    offset: number,
    fetch: (
      store: LevelRepository,
      guildId: string,
      limit: number,
      offset: number,
    ) => Promise<{
      entries: LevelBoardEntry[];
      total: number;
    }>,
  ): Promise<{ entries: BoardEntry[]; total: number }> {
    const { entries, total } = await fetch(
      this.store,
      guildId,
      limit,
      offset,
    );
    return {
      entries: entries.map((entry) => ({
        userId: entry.userId,
        rank: entry.rank,
        level: entry.level,
        xp: entry.xp,
        totalXp: totalXpForLevel(config.formula, entry.level) + entry.xp,
        messageCount: entry.messageCount,
        voiceMinutes: entry.voiceMinutes,
        windowTotal: null,
      })),
      total,
    };
  }

  private async windowBoard(
    guildId: string,
    board: "weekly" | "monthly",
    config: LevelingConfig,
    limit: number,
    offset: number,
  ): Promise<{ entries: BoardEntry[]; total: number }> {
    const days = board === "weekly" ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { entries, total } = await this.store.rankedWindow(
      guildId,
      since,
      limit,
      offset,
    );
    const full = await Promise.all(
      entries.map(async (e) => {
        const account = await this.store.findAccount(guildId, e.userId);
        const level = account?.level ?? 1;
        const xp = account?.xp ?? 0;
        return {
          userId: e.userId,
          rank: e.rank,
          level,
          xp,
          totalXp: totalXpForLevel(config.formula, level) + xp,
          messageCount: account?.messageCount ?? 0,
          voiceMinutes: account?.voiceMinutes ?? 0,
          windowTotal: e.total,
        };
      }),
    );
    return { entries: full, total };
  }

  public rankOf(guildId: string, userId: string): Promise<number | null> {
    return this.store.rankOf(guildId, userId);
  }

  private async onLevelUp(
    member: GuildMember,
    account: LevelBalance,
    config: LevelingConfig,
    fallbackChannel?: TextBasedChannel | null,
  ): Promise<void> {
    await this.applyRoleRewards(member, account.level, config).catch(
      () => null,
    );
    if (!config.announceEnabled) return;
    const target =
      (await this.resolveAnnounceChannel(
        member.guild,
        config,
        fallbackChannel,
      )) ?? null;
    if (!target || !target.isTextBased()) return;
    if (!("send" in target)) return;
    const me = member.guild.members.me;
    if (me && "permissionsFor" in target) {
      const perms = target.permissionsFor(me);
      if (perms && !perms.has(PermissionsBitField.Flags.SendMessages)) return;
    }
    const xpNeeded = xpForLevel(config.formula, account.level);
    const content = renderAnnouncement(
      config.announceMessage,
      member,
      account,
      xpNeeded,
    );
    await target
      .send({ content, allowedMentions: { parse: [] } })
      .catch(() => null);
  }

  private async resolveAnnounceChannel(
    guild: Guild,
    config: LevelingConfig,
    fallback?: TextBasedChannel | null,
  ): Promise<TextBasedChannel | null> {
    if (config.announceChannelId) {
      const channel = await guild.channels
        .fetch(config.announceChannelId)
        .catch(() => null);
      if (channel?.isTextBased()) return channel;
    }
    if (fallback?.isTextBased()) return fallback;
    return guild.systemChannel;
  }

  private async applyRoleRewards(
    member: GuildMember,
    level: number,
    config: LevelingConfig,
  ): Promise<void> {
    if (config.levelRewards.length === 0) return;
    const earned = config.levelRewards.filter((reward) => reward.level <= level);
    if (earned.length === 0) return;
    const keep = config.roleStack
      ? earned
      : [earned[earned.length - 1]!];
    const keepIds = new Set(keep.map((reward) => reward.roleId));
    for (const reward of keep) {
      if (!member.roles.cache.has(reward.roleId)) {
        await member.roles.add(reward.roleId).catch(() => null);
      }
    }
    if (!config.roleStack) {
      for (const reward of config.levelRewards) {
        if (!keepIds.has(reward.roleId) && member.roles.cache.has(reward.roleId)) {
          await member.roles.remove(reward.roleId).catch(() => null);
        }
      }
    }
  }
}
