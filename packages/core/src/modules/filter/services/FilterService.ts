import { Service, getService } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { RedisKeys } from "#database/redis.js";
import {
  compileRules,
  evaluateStatic,
  evaluateTerms,
  DEFAULT_CAPS_MIN_LENGTH,
  type CompiledRules,
  type FilterHit,
  type RuleConfig,
} from "../lib/rules.js";
import { decayHeat, secondsUntilCool, type HeatConfig } from "../lib/heat.js";
import {
  getRegexWorker,
  RegexTimeoutError,
} from "#lib/regex-worker/index.js";

const DUPLICATE_WINDOW_SECONDS = 30;
const WARN_COOLDOWN_SECONDS = 30;

/** djb2 — a cheap, short, non-cryptographic fingerprint of message content. */
function fingerprint(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

@ApplyOptions<Piece.Options>({ name: "filter" })
export class FilterService extends Service {
  private readonly _guilds = new Map<string, CompiledRules | null>();
  private readonly _heat = new Map<string, HeatConfig>();
  /** Bumped whenever a guild's patterns change, so the worker re-loads them. */
  private readonly _versions = new Map<string, number>();

  public async loadGuild(guildId: string): Promise<void> {
    const configService = getService("config");
    const get = (key: string) =>
      this.container.db.config.getModuleConfig(guildId, "filter", key);
    const [
      terms,
      regexRules,
      blockInvites,
      inviteAllowlist,
      blockLinks,
      linkAllowlist,
      maxMentions,
      maxCapsPercent,
      capsMinLength,
    ] = await Promise.all([
      configService.getConfigList(guildId, "filter", "terms"),
      configService.getConfigList(guildId, "filter", "regex_rules"),
      get("block_invites"),
      configService.getConfigList(guildId, "filter", "invite_allowlist"),
      get("block_links"),
      configService.getConfigList(guildId, "filter", "link_allowlist"),
      get("max_mentions"),
      get("max_caps_percent"),
      get("caps_min_length"),
    ]);

    this.rebuild(guildId, {
      terms,
      regexRules,
      blockInvites: blockInvites === true,
      inviteAllowlist,
      blockLinks: blockLinks === true,
      linkAllowlist,
      maxMentions: typeof maxMentions === "number" ? maxMentions : 0,
      maxCapsPercent: typeof maxCapsPercent === "number" ? maxCapsPercent : 0,
      capsMinLength:
        typeof capsMinLength === "number"
          ? capsMinLength
          : DEFAULT_CAPS_MIN_LENGTH,
    });
    this._heat.set(guildId, await this.loadHeatConfig(guildId));
  }

  /** In-memory heat config for the hot message path; undefined until hydrated. */
  public getHeat(guildId: string): HeatConfig | undefined {
    return this._heat.get(guildId);
  }

  public rebuild(guildId: string, config: RuleConfig): void {
    const enabled =
      config.terms.length > 0 ||
      config.regexRules.length > 0 ||
      config.blockInvites ||
      config.blockLinks ||
      config.maxMentions > 0 ||
      config.maxCapsPercent > 0;

    this._guilds.delete(guildId);
    this._guilds.set(
      guildId,
      enabled
        ? compileRules(config, (pattern, reason) =>
            this.container.logger.warn(
              `[Filter] Skipping invalid regex rule in guild ${guildId}: /${pattern}/ (${reason})`,
            ),
          )
        : null,
    );
    this.#bumpVersion(guildId);
    this.#evictIfNeeded();
  }

  public has(guildId: string): boolean {
    return this._guilds.has(guildId);
  }

  /**
   * Evaluate a message. Terms and the bounded rules run inline; guild regex is
   * dispatched to the regex worker so a catastrophic pattern cannot stall the
   * event loop. A pattern that blows its budget is dropped from this guild's
   * rule set rather than retried on every subsequent message.
   */
  public async test(
    guildId: string,
    content: string,
    mentionCount: number,
  ): Promise<FilterHit | null> {
    if (!this._guilds.has(guildId)) return null;
    const rules = this.#touch(guildId);
    if (!rules) return null;

    const termHit = evaluateTerms(rules, content);
    if (termHit) return termHit;

    const regexHit = await this.#testRegex(guildId, rules, content);
    if (regexHit) return regexHit;

    return evaluateStatic(rules, content, mentionCount);
  }

  async #testRegex(
    guildId: string,
    rules: CompiledRules,
    content: string,
  ): Promise<FilterHit | null> {
    if (rules.regexSources.length === 0) return null;
    const key = `${guildId}:${this._versions.get(guildId) ?? 0}`;
    try {
      const index = await getRegexWorker().test(
        key,
        rules.regexSources,
        content,
      );
      return index === null
        ? null
        : { rule: "regex", detail: rules.regexSources[index]! };
    } catch (err: unknown) {
      if (err instanceof RegexTimeoutError) {
        this.#disablePattern(guildId, rules, err.patternIndex);
        return null;
      }
      this.container.logger.error(
        `[Filter] Regex evaluation failed in guild ${guildId}:`,
        err,
      );
      return null;
    }
  }

  /** Drop the pattern that hung, in place, and invalidate the worker's copy. */
  #disablePattern(
    guildId: string,
    rules: CompiledRules,
    index: number | null,
  ): void {
    if (index === null || index >= rules.regexSources.length) {
      this.container.logger.warn(
        `[Filter] Regex evaluation timed out in guild ${guildId} before any pattern was reported; leaving rules untouched.`,
      );
      return;
    }
    const [pattern] = rules.regexSources.splice(index, 1);
    this.#bumpVersion(guildId);
    this.container.logger.warn(
      `[Filter] Disabled regex rule in guild ${guildId}: /${pattern}/ exceeded its evaluation budget (catastrophic backtracking). Remove or rewrite it; it stays disabled until the config is reloaded.`,
    );
  }

  #bumpVersion(guildId: string): void {
    this._versions.set(guildId, (this._versions.get(guildId) ?? 0) + 1);
  }

  public evict(guildId: string): void {
    this._guilds.delete(guildId);
    this._heat.delete(guildId);
    this._versions.delete(guildId);
  }

  public async loadHeatConfig(guildId: string): Promise<HeatConfig> {
    const raw = await this.container.db.config.getAllModuleConfig(
      guildId,
      "filter",
    );
    const num = (key: string, fallback: number): number =>
      typeof raw[key] === "number" ? (raw[key]) : fallback;
    return {
      enabled: raw["heat_enabled"] === true,
      perMessage: num("heat_per_message", 0),
      perMention: num("heat_per_mention", 0),
      perDuplicate: num("heat_per_duplicate", 0),
      perFilterHit: num("heat_per_filter_hit", 10),
      decayPerMinute: num("heat_decay_per_minute", 10),
      warnAt: num("heat_warn", 0),
      timeoutAt: num("heat_timeout", 30),
      quarantineAt: num("heat_quarantine", 0),
      timeoutMinutes: num("heat_timeout_minutes", 10),
    };
  }

  /**
   * Adds `points` to a member's heat after decaying the stored value to now,
   * re-stamps the key, and expires it once it would cool to zero. Returns the
   * new heat.
   */
  public async addHeat(
    guildId: string,
    userId: string,
    points: number,
    config: HeatConfig,
  ): Promise<number> {
    const key = RedisKeys.filterHeat(guildId, userId);
    const now = Date.now();
    const cur = await this.redis.hgetall(key);
    const stored = cur["h"] ? Number.parseFloat(cur["h"]) : 0;
    const lastTs = cur["t"] ? Number.parseInt(cur["t"], 10) : now;
    const next =
      decayHeat(stored, lastTs, now, config.decayPerMinute) + points;
    await this.redis
      .multi()
      .hset(key, "h", next.toFixed(3), "t", String(now))
      .expire(key, secondsUntilCool(next, config.decayPerMinute))
      .exec();
    return next;
  }

  public async clearHeat(guildId: string, userId: string): Promise<void> {
    await this.redis.del(RedisKeys.filterHeat(guildId, userId));
  }

  /** True when this message repeats the member's previous one within the window. */
  public async isDuplicate(
    guildId: string,
    userId: string,
    content: string,
  ): Promise<boolean> {
    if (content.trim().length === 0) return false;
    const key = RedisKeys.filterLastMsg(guildId, userId);
    const fp = fingerprint(content);
    const prev = await this.redis.getset(key, fp);
    await this.redis.expire(key, DUPLICATE_WINDOW_SECONDS);
    return prev === fp;
  }

  /** One-shot guard so a sustained-hot member is warned once per window, not per message. */
  public async claimWarnSlot(guildId: string, userId: string): Promise<boolean> {
    const set = await this.redis.set(
      RedisKeys.filterHeatActed(guildId, userId),
      "1",
      "EX",
      WARN_COOLDOWN_SECONDS,
      "NX",
    );
    return set === "OK";
  }

  /** Mark a guild as most-recently-used and return its rule set. */
  #touch(guildId: string): CompiledRules | null {
    const rules = this._guilds.get(guildId) ?? null;
    this._guilds.delete(guildId);
    this._guilds.set(guildId, rules);
    return rules;
  }

  #evictIfNeeded(): void {
    while (this._guilds.size > FilterService.MAX_GUILDS) {
      const oldest = this._guilds.keys().next().value;
      if (oldest === undefined) break;
      this._guilds.delete(oldest);
      this._heat.delete(oldest);
      this._versions.delete(oldest);
    }
  }

  private static readonly MAX_GUILDS = 10_000;
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    filter: FilterService;
  }
}
