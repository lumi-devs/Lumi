import { Utility } from "#lib/module-system/Utility.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { RedisKeys } from "#database/redis.js";
import { parseConfigList } from "#lib/module-system/config-schema.js";
import {
  compileRules,
  evaluateStatic,
  evaluateTerms,
  DEFAULT_CAPS_MIN_LENGTH,
  type CompiledRules,
  type FilterHit,
  type RuleConfig,
} from "../lib/rules.js";
import { type HeatConfig } from "../lib/heat.js";
import {
  getRegexWorker,
  RegexTimeoutError,
  RegexWorkerUnavailableError,
} from "#lib/regex-worker/index.js";

const DUPLICATE_WINDOW_SECONDS = 30;
const WARN_COOLDOWN_SECONDS = 30;

/**
 * Decay-then-add in one round trip. A burst of messages from one member is
 * handled by concurrent listener invocations; an HGETALL/HSET pair around an
 * await lets them all read the same heat and write back the same value, so a
 * spammer's heat stops climbing exactly when it should be climbing fastest.
 * Mirrors `decayHeat`/`secondsUntilCool` from ../lib/heat.js.
 */
const ADD_HEAT_SCRIPT = `
local h = tonumber(redis.call('HGET', KEYS[1], 'h')) or 0
local t = tonumber(redis.call('HGET', KEYS[1], 't'))
local now = tonumber(ARGV[1])
local decay = tonumber(ARGV[2])
local points = tonumber(ARGV[3])
if t == nil then t = now end
local cur = h
if decay > 0 then
  local minutes = (now - t) / 60000
  if minutes < 0 then minutes = 0 end
  cur = h - minutes * decay
end
if cur < 0 then cur = 0 end
local nxt = cur + points
local ttl = 3600
if decay > 0 then ttl = math.ceil(nxt / decay * 60) + 60 end
local value = string.format('%.3f', nxt)
redis.call('HSET', KEYS[1], 'h', value, 't', string.format('%d', now))
redis.call('EXPIRE', KEYS[1], string.format('%d', ttl))
return value
`;

/** djb2 — a cheap, short, non-cryptographic fingerprint of message content. */
function fingerprint(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

@ApplyOptions<Piece.Options>({ name: "filter" })
export class FilterUtility extends Utility {
  private readonly _guilds = new Map<string, CompiledRules | null>();
  private readonly _heat = new Map<string, HeatConfig>();
  /** Bumped whenever a guild's patterns change, so the worker re-loads them. */
  private readonly _versions = new Map<string, number>();

  public async loadGuild(guildId: string): Promise<void> {
    // getModuleConfig resolves through getAllModuleConfig, so reading each key
    // separately meant one Redis round trip per key against the same cache
    // entry. Read the module's config once and derive every field from it.
    const raw = await this.container.db.config.getAllModuleConfig(
      guildId,
      "filter",
    );
    const num = (key: string, fallback: number): number =>
      typeof raw[key] === "number" ? raw[key] : fallback;

    this.rebuild(guildId, {
      terms: parseConfigList(raw["terms"] ?? null),
      regexRules: parseConfigList(raw["regex_rules"] ?? null),
      blockInvites: raw["block_invites"] === true,
      inviteAllowlist: parseConfigList(raw["invite_allowlist"] ?? null),
      blockLinks: raw["block_links"] === true,
      linkAllowlist: parseConfigList(raw["link_allowlist"] ?? null),
      maxMentions: num("max_mentions", 0),
      maxCapsPercent: num("max_caps_percent", 0),
      capsMinLength: num("caps_min_length", DEFAULT_CAPS_MIN_LENGTH),
    });
    this._heat.set(guildId, this.buildHeatConfig(raw));
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
      if (err instanceof RegexWorkerUnavailableError) {
        this.container.logger.error(
          `[Filter] Regex worker unavailable; regex rules skipped for guild ${guildId}.`,
        );
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
    return this.buildHeatConfig(
      await this.container.db.config.getAllModuleConfig(guildId, "filter"),
    );
  }

  public buildHeatConfig(raw: Record<string, unknown>): HeatConfig {
    const num = (key: string, fallback: number): number =>
      typeof raw[key] === "number" ? raw[key] : fallback;
    return {
      enabled: raw["heat_enabled"] === true,
      perMessage: num("heat_per_message", 0),
      perMention: num("heat_per_mention", 0),
      perDuplicate: num("heat_per_duplicate", 0),
      perFilterHit: num("heat_per_filter_hit", 10),
      perAttachment: num("heat_per_attachment", 0),
      perEmoji: num("heat_per_emoji", 0),
      perLink: num("heat_per_link", 0),
      webhookMultiplier: num("heat_webhook_multiplier", 1),
      decayPerMinute: num("heat_decay_per_minute", 10),
      warnAt: num("heat_warn", 0),
      timeoutAt: num("heat_timeout", 30),
      quarantineAt: num("heat_quarantine", 0),
      timeoutMinutes: num("heat_timeout_minutes", 10),
      multiplierEnabled: raw["heat_multiplier_enabled"] === true,
      multiplierBase: num("heat_multiplier_base", 2),
      panicRaiderCount: num("heat_panic_raider_count", 0),
      panicWindowSeconds: num("heat_panic_window_seconds", 30),
      lockdownMentionThreshold: num("lockdown_mention_threshold", 0),
      lockdownWindowSeconds: num("lockdown_window_seconds", 30),
      lockdownDurationMinutes: num("lockdown_duration_minutes", 10),
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
    const next = Number.parseFloat(
      (await this.redis.eval(
        ADD_HEAT_SCRIPT,
        1,
        key,
        String(now),
        String(config.decayPerMinute),
        String(points),
      )) as string,
    );
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

  /**
   * One-shot guard so a sustained-hot member is escalated once per window, not
   * once per message: several messages in the same burst can each cross the
   * threshold before the first escalation's `clearHeat` lands.
   */
  public async claimEscalation(
    guildId: string,
    userId: string,
    action: string,
  ): Promise<boolean> {
    const set = await this.redis.set(
      `${RedisKeys.filterHeatActed(guildId, userId)}:${action}`,
      "1",
      "EX",
      WARN_COOLDOWN_SECONDS,
      "NX",
    );
    return set === "OK";
  }

  private static readonly VIOLATION_RESET_SECONDS = 86_400;
  private static readonly HEAT_PANIC_FLAG_SECONDS = 600;
  private static readonly MENTION_WINDOW_DEFAULT_SECONDS = 30;

  /**
   * Bumps the "timeouts since last clean day" counter used by the escalating
   * multiplier. The TTL refreshes on every call, so a member who stops
   * offending for `VIOLATION_RESET_SECONDS` starts over at the base duration.
   */
  public async recordViolation(guildId: string, userId: string): Promise<number> {
    const key = RedisKeys.filterHeatViolations(guildId, userId);
    const results = await this.redis
      .multi()
      .incr(key)
      .expire(key, FilterUtility.VIOLATION_RESET_SECONDS)
      .exec();
    return (results?.[0]?.[1] as number) ?? 1;
  }

  /**
   * Counts this escalation toward heat panic mode (distinct raiders tripping
   * timeout/quarantine within a short window). Once `raiderCount` distinct
   * members are flagged, panic mode activates for
   * {@link HEAT_PANIC_FLAG_SECONDS} and every flagged raider is marked so
   * their next message can be actioned instantly.
   */
  public async recordHeatPanicRaider(
    guildId: string,
    userId: string,
    config: Pick<HeatConfig, "panicWindowSeconds" | "panicRaiderCount">,
  ): Promise<boolean> {
    if (config.panicRaiderCount <= 0) return false;
    const key = RedisKeys.filterHeatPanicRaiders(guildId);
    const results = await this.redis
      .multi()
      .sadd(key, userId)
      .expire(key, config.panicWindowSeconds)
      .scard(key)
      .exec();
    const distinct = (results?.[2]?.[1] as number) ?? 0;
    if (distinct < config.panicRaiderCount) return false;

    await this.redis.set(
      RedisKeys.filterHeatPanicFlagged(guildId, userId),
      "1",
      "EX",
      FilterUtility.HEAT_PANIC_FLAG_SECONDS,
    );
    const activated = await this.redis.set(
      RedisKeys.filterHeatPanicActive(guildId),
      String(Date.now()),
      "EX",
      FilterUtility.HEAT_PANIC_FLAG_SECONDS,
      "NX",
    );
    return activated === "OK";
  }

  /** Flags a member as an active-panic raider so their next message is actioned instantly. */
  public async flagHeatPanicRaider(guildId: string, userId: string): Promise<void> {
    await this.redis.set(
      RedisKeys.filterHeatPanicFlagged(guildId, userId),
      "1",
      "EX",
      FilterUtility.HEAT_PANIC_FLAG_SECONDS,
    );
  }

  public async isHeatPanicActive(guildId: string): Promise<boolean> {
    return (await this.redis.exists(RedisKeys.filterHeatPanicActive(guildId))) === 1;
  }

  public async isFlaggedRaider(guildId: string, userId: string): Promise<boolean> {
    return (
      (await this.redis.exists(RedisKeys.filterHeatPanicFlagged(guildId, userId))) === 1
    );
  }

  /**
   * Adds `count` non-exempt mentions to the guild-wide flood window. Returns
   * the running total so the caller can compare it against the configured
   * threshold.
   */
  public async recordMentions(
    guildId: string,
    count: number,
    windowSeconds: number,
  ): Promise<number> {
    if (count <= 0) return 0;
    const key = RedisKeys.filterMentionWindow(guildId);
    const results = await this.redis
      .multi()
      .incrby(key, count)
      .expire(
        key,
        windowSeconds > 0 ? windowSeconds : FilterUtility.MENTION_WINDOW_DEFAULT_SECONDS,
        "NX",
      )
      .exec();
    return (results?.[0]?.[1] as number) ?? count;
  }

  /** Marks the guild as auto-locked for `durationMinutes`. Returns false if already locked. */
  public async activateAutoLockdown(
    guildId: string,
    durationMinutes: number,
  ): Promise<boolean> {
    const activated = await this.redis.set(
      RedisKeys.filterAutoLockdown(guildId),
      String(Date.now()),
      "EX",
      Math.max(60, durationMinutes * 60),
      "NX",
    );
    return activated === "OK";
  }

  /** Undo `activateAutoLockdown` when the lockdown could not actually be carried out. */
  public async releaseAutoLockdown(guildId: string): Promise<void> {
    await this.redis.del(RedisKeys.filterAutoLockdown(guildId));
  }

  /** Mark a guild as most-recently-used and return its rule set. */
  #touch(guildId: string): CompiledRules | null {
    const rules = this._guilds.get(guildId) ?? null;
    this._guilds.delete(guildId);
    this._guilds.set(guildId, rules);
    return rules;
  }

  #evictIfNeeded(): void {
    const limit = this.#cacheLimit();
    while (this._guilds.size > limit) {
      const oldest = this._guilds.keys().next().value;
      if (oldest === undefined) break;
      this._guilds.delete(oldest);
      this._heat.delete(oldest);
      this._versions.delete(oldest);
    }
  }

  /**
   * Hold at most what this process actually serves. A fixed ceiling is wrong in
   * both directions: too low and a large shard evicts guilds it is still
   * filtering for, recompiling their rules on the next message; too high and it
   * is not a bound at all. Sizing to the live guild count means an active guild
   * is never evicted, and the map cannot outgrow the shard.
   *
   * The floor covers startup, before the guild cache has populated.
   */
  #cacheLimit(): number {
    return Math.max(
      FilterUtility.MIN_CACHED_GUILDS,
      this.container.client.guilds.cache.size,
    );
  }

  private static readonly MIN_CACHED_GUILDS = 1_000;
}

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    filter: FilterUtility;
  }
}
