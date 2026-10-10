import { defineUtility } from "@lumi/lib/module-system/utility.js";
import type { Container } from "@lumi/lib/services.js";
import { ValkeyKeys } from "@lumi/lib/valkey/client.js";
import { toStringArray } from "@lumi/lib/module-system/config-schema.js";
import {
  compileRules,
  evaluateStatic,
  evaluateTerms,
  DefaultCapsMinLength,
  type CompiledRules,
  type FilterHit,
  type RuleConfig,
} from "@lumi/application/services/filter/rules.js";
import { type HeatConfig } from "@lumi/application/services/filter/heat.js";
import {
  getRegexWorker,
  RegexTimeoutError,
  RegexWorkerUnavailableError,
} from "@lumi/lib/regex-worker/handler.js";

const DuplicateWindowSeconds = 30;
const WarnCooldownSeconds = 30;

/**
 * Decay-then-add in one round trip. A burst of messages from one member is
 * handled by concurrent listener invocations; an HGETALL/HSET pair around an
 * await lets them all read the same heat and write back the same value, so a
 * spammer's heat stops climbing exactly when it should be climbing fastest.
 * Mirrors `decayHeat`/`secondsUntilCool` from ../services/heat.js.
 */
const AddHeatScript = `
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

/** Content is capped before storage/comparison to bound Valkey memory and CPU cost. */
const DuplicateContentCap = 300;
/** Levenshtein is O(n*m); cap the compared length separately, tighter than storage. */
const SimilarityCompareCap = 200;

/** Bounded Levenshtein distance — local to `filter` so message-content comparison
 * doesn't share a module boundary with `security`'s username-similarity check. */
function levenshteinDistance(a: string, b: string): number {
  const s1 = a.slice(0, SimilarityCompareCap);
  const s2 = b.slice(0, SimilarityCompareCap);
  const rows = s1.length + 1;
  const cols = s2.length + 1;
  const dp: number[] = new Array(rows * cols).fill(0);
  for (let i = 0; i < rows; i++) dp[i * cols] = i;
  for (let j = 0; j < cols; j++) dp[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      const del = (dp[(i - 1) * cols + j] ?? 0) + 1;
      const ins = (dp[i * cols + j - 1] ?? 0) + 1;
      const sub = (dp[(i - 1) * cols + j - 1] ?? 0) + cost;
      dp[i * cols + j] = Math.min(del, ins, sub);
    }
  }
  return dp[rows * cols - 1] ?? 0;
}

/** 1.0 = identical (within the compare cap), 0.0 = completely different. */
function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(
    Math.min(a.length, SimilarityCompareCap),
    Math.min(b.length, SimilarityCompareCap),
  );
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

const compiledByGuild = new Map<string, CompiledRules | null>();
const heatByGuild = new Map<string, HeatConfig>();
/** Bumped whenever a guild's patterns change, so the worker re-loads them. */
const versionsByGuild = new Map<string, number>();

const VIOLATION_RESET_SECONDS = 86_400;
const HEAT_PANIC_FLAG_SECONDS = 600;
const MENTION_WINDOW_DEFAULT_SECONDS = 30;
const MIN_CACHED_GUILDS = 1_000;

function rebuild(services: Container, guildId: string, config: RuleConfig): void {
  const enabled =
    config.terms.length > 0 ||
    config.regexRules.length > 0 ||
    config.blockInvites ||
    config.blockLinks ||
    config.maxMentions > 0 ||
    config.maxCapsPercent > 0;

  compiledByGuild.delete(guildId);
  compiledByGuild.set(
    guildId,
    enabled
      ? compileRules(config, (pattern, reason) =>
          services.logger.warn(
            `[Filter] Skipping invalid regex rule in guild ${guildId}: /${pattern}/ (${reason})`,
          ),
        )
      : null,
  );
  bumpVersion(guildId);
  evictIfNeeded(services);
}

function buildHeatConfig(raw: Record<string, unknown>): HeatConfig {
  const num = (key: string, fallback: number): number =>
    typeof raw[key] === "number" ? raw[key] : fallback;
  return {
    enabled: raw["heat_enabled"] === true,
    perMessage: num("heat_per_message", 0),
    perMention: num("heat_per_mention", 0),
    perDuplicate: num("heat_per_duplicate", 0),
    perSimilar: num("heat_per_similar", 0),
    similarityThreshold: num("heat_similarity_threshold", 0.85),
    perZalgo: num("heat_per_zalgo", 0),
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

function touch(guildId: string): CompiledRules | null {
  const rules = compiledByGuild.get(guildId) ?? null;
  compiledByGuild.delete(guildId);
  compiledByGuild.set(guildId, rules);
  return rules;
}

function bumpVersion(guildId: string): void {
  versionsByGuild.set(guildId, (versionsByGuild.get(guildId) ?? 0) + 1);
}

function evictIfNeeded(services: Container): void {
  const limit = cacheLimit(services);
  while (compiledByGuild.size > limit) {
    const oldest = compiledByGuild.keys().next().value;
    if (oldest === undefined) break;
    compiledByGuild.delete(oldest);
    heatByGuild.delete(oldest);
    versionsByGuild.delete(oldest);
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
function cacheLimit(services: Container): number {
  return Math.max(
    MIN_CACHED_GUILDS,
    services.client.guilds.cache.size,
  );
}

async function testRegex(
  services: Container,
  guildId: string,
  rules: CompiledRules,
  content: string,
): Promise<FilterHit | null> {
  if (rules.regexSources.length === 0) return null;
  const key = `${guildId}:${versionsByGuild.get(guildId) ?? 0}`;
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
      disablePattern(services, guildId, rules, err.patternIndex);
      return null;
    }
    if (err instanceof RegexWorkerUnavailableError) {
      services.logger.error(
        `[Filter] Regex worker unavailable; regex rules skipped for guild ${guildId}.`,
      );
      return null;
    }
    services.logger.error(
      `[Filter] Regex evaluation failed in guild ${guildId}:`,
      err,
    );
    return null;
  }
}

/** Drop the pattern that hung, in place, and invalidate the worker's copy. */
function disablePattern(
  services: Container,
  guildId: string,
  rules: CompiledRules,
  index: number | null,
): void {
  if (index === null || index >= rules.regexSources.length) {
    services.logger.warn(
      `[Filter] Regex evaluation timed out in guild ${guildId} before any pattern was reported; leaving rules untouched.`,
    );
    return;
  }
  const [pattern] = rules.regexSources.splice(index, 1);
  bumpVersion(guildId);
  services.logger.warn(
    `[Filter] Disabled regex rule in guild ${guildId}: /${pattern}/ exceeded its evaluation budget (catastrophic backtracking). Remove or rewrite it; it stays disabled until the config is reloaded.`,
  );
}

export const filterUtility = defineUtility({
  name: "filter",

  rebuild,
  buildHeatConfig,

  async loadGuild(services: Container, guildId: string): Promise<void> {
    // getModuleConfig resolves through getAllModuleConfig, so reading each key
    // separately meant one Valkey round trip per key against the same cache
    // entry. Read the module's config once and derive every field from it.
    const raw = await services.db.config.getAllModuleConfig(
      guildId,
      "filter",
    );
    const num = (key: string, fallback: number): number =>
      typeof raw[key] === "number" ? raw[key] : fallback;

    rebuild(services, guildId, {
      terms: toStringArray(raw["terms"]),
      regexRules: toStringArray(raw["regex_rules"]),
      blockInvites: raw["block_invites"] === true,
      inviteAllowlist: toStringArray(raw["invite_allowlist"]),
      blockLinks: raw["block_links"] === true,
      linkAllowlist: toStringArray(raw["link_allowlist"]),
      maxMentions: num("max_mentions", 0),
      maxCapsPercent: num("max_caps_percent", 0),
      capsMinLength: num("caps_min_length", DefaultCapsMinLength),
    });
    heatByGuild.set(guildId, buildHeatConfig(raw));
  },

  /** In-memory heat config for the hot message path; undefined until hydrated. */
  getHeat(guildId: string): HeatConfig | undefined {
    return heatByGuild.get(guildId);
  },

  has(guildId: string): boolean {
    return compiledByGuild.has(guildId);
  },

  /**
   * Evaluate a message. Terms and the bounded rules run inline; guild regex is
   * dispatched to the regex worker so a catastrophic pattern cannot stall the
   * event loop. A pattern that blows its budget is dropped from this guild's
   * rule set rather than retried on every subsequent message.
   */
  async test(
    services: Container,
    guildId: string,
    content: string,
    mentionCount: number,
  ): Promise<FilterHit | null> {
    if (!compiledByGuild.has(guildId)) return null;
    const rules = touch(guildId);
    if (!rules) return null;

    const termHit = evaluateTerms(rules, content);
    if (termHit) return termHit;

    const regexHit = await testRegex(services, guildId, rules, content);
    if (regexHit) return regexHit;

    return evaluateStatic(rules, content, mentionCount);
  },

  evict(guildId: string): void {
    compiledByGuild.delete(guildId);
    heatByGuild.delete(guildId);
    versionsByGuild.delete(guildId);
  },

  async loadHeatConfig(services: Container, guildId: string): Promise<HeatConfig> {
    return buildHeatConfig(
      await services.db.config.getAllModuleConfig(guildId, "filter"),
    );
  },

  /**
   * Adds `points` to a member's heat after decaying the stored value to now,
   * re-stamps the key, and expires it once it would cool to zero. Returns the
   * new heat.
   */
  async addHeat(
    services: Container,
    guildId: string,
    userId: string,
    points: number,
    config: HeatConfig,
  ): Promise<number> {
    const key = ValkeyKeys.filterHeat(guildId, userId);
    const now = Date.now();
    const next = Number.parseFloat(
      (await services.valkey.eval(
        AddHeatScript,
        1,
        key,
        String(now),
        String(config.decayPerMinute),
        String(points),
      )) as string,
    );
    return next;
  },

  async clearHeat(services: Container, guildId: string, userId: string): Promise<void> {
    await services.invalidation.invalidate(ValkeyKeys.filterHeat(guildId, userId));
  },

  /**
   * Compares this message against the member's previous one within the
   * window: `exact` for an identical (capped) match, `similarity` as a
   * Levenshtein ratio against it for reworded/copy-paste-variant spam.
   */
  async checkDuplicate(
    services: Container,
    guildId: string,
    userId: string,
    content: string,
  ): Promise<{ exact: boolean; similarity: number }> {
    const trimmed = content.trim();
    if (trimmed.length === 0) return { exact: false, similarity: 0 };
    const capped = trimmed.slice(0, DuplicateContentCap);
    const key = ValkeyKeys.filterLastMsg(guildId, userId);
    const prev = await services.valkey.getset(key, capped);
    await services.valkey.expire(key, DuplicateWindowSeconds);
    if (prev === null) return { exact: false, similarity: 0 };
    if (prev === capped) return { exact: true, similarity: 1 };
    return { exact: false, similarity: similarityRatio(prev, capped) };
  },

  /**
   * One-shot guard so a sustained-hot member is escalated once per window, not
   * once per message: several messages in the same burst can each cross the
   * threshold before the first escalation's `clearHeat` lands.
   */
  async claimEscalation(
    services: Container,
    guildId: string,
    userId: string,
    action: string,
  ): Promise<boolean> {
    const set = await services.valkey.set(
      `${ValkeyKeys.filterHeatActed(guildId, userId)}:${action}`,
      "1",
      "EX",
      WarnCooldownSeconds,
      "NX",
    );
    return set === "OK";
  },

  /**
   * Bumps the "timeouts since last clean day" counter used by the escalating
   * multiplier. The TTL refreshes on every call, so a member who stops
   * offending for `VIOLATION_RESET_SECONDS` starts over at the base duration.
   */
  async recordViolation(services: Container, guildId: string, userId: string): Promise<number> {
    const key = ValkeyKeys.filterHeatViolations(guildId, userId);
    const results = await services.valkey
      .multi()
      .incr(key)
      .expire(key, VIOLATION_RESET_SECONDS)
      .exec();
    return (results?.[0]?.[1] as number) ?? 1;
  },

  /**
   * Counts this escalation toward heat panic mode (distinct raiders tripping
   * timeout/quarantine within a short window). Once `raiderCount` distinct
   * members are flagged, panic mode activates for
   * {@link HEAT_PANIC_FLAG_SECONDS} and every flagged raider is marked so
   * their next message can be actioned instantly.
   */
  async recordHeatPanicRaider(
    services: Container,
    guildId: string,
    userId: string,
    config: Pick<HeatConfig, "panicWindowSeconds" | "panicRaiderCount">,
  ): Promise<boolean> {
    if (config.panicRaiderCount <= 0) return false;
    const key = ValkeyKeys.filterHeatPanicRaiders(guildId);
    const results = await services.valkey
      .multi()
      .sadd(key, userId)
      .expire(key, config.panicWindowSeconds)
      .scard(key)
      .exec();
    const distinct = (results?.[2]?.[1] as number) ?? 0;
    if (distinct < config.panicRaiderCount) return false;

    await services.valkey.set(
      ValkeyKeys.filterHeatPanicFlagged(guildId, userId),
      "1",
      "EX",
      HEAT_PANIC_FLAG_SECONDS,
    );
    const activated = await services.valkey.set(
      ValkeyKeys.filterHeatPanicActive(guildId),
      String(Date.now()),
      "EX",
      HEAT_PANIC_FLAG_SECONDS,
      "NX",
    );
    return activated === "OK";
  },

  /** Flags a member as an active-panic raider so their next message is actioned instantly. */
  async flagHeatPanicRaider(services: Container, guildId: string, userId: string): Promise<void> {
    await services.valkey.set(
      ValkeyKeys.filterHeatPanicFlagged(guildId, userId),
      "1",
      "EX",
      HEAT_PANIC_FLAG_SECONDS,
    );
  },

  async isHeatPanicActive(services: Container, guildId: string): Promise<boolean> {
    return (await services.valkey.exists(ValkeyKeys.filterHeatPanicActive(guildId))) === 1;
  },

  async isFlaggedRaider(services: Container, guildId: string, userId: string): Promise<boolean> {
    return (
      (await services.valkey.exists(ValkeyKeys.filterHeatPanicFlagged(guildId, userId))) === 1
    );
  },

  /**
   * Adds `count` non-exempt mentions to the guild-wide flood window. Returns
   * the running total so the caller can compare it against the configured
   * threshold.
   */
  async recordMentions(
    services: Container,
    guildId: string,
    count: number,
    windowSeconds: number,
  ): Promise<number> {
    if (count <= 0) return 0;
    const key = ValkeyKeys.filterMentionWindow(guildId);
    const results = await services.valkey
      .multi()
      .incrby(key, count)
      .expire(
        key,
        windowSeconds > 0 ? windowSeconds : MENTION_WINDOW_DEFAULT_SECONDS,
        "NX",
      )
      .exec();
    return (results?.[0]?.[1] as number) ?? count;
  },

  /** Marks the guild as auto-locked for `durationMinutes`. Returns false if already locked. */
  async activateAutoLockdown(
    services: Container,
    guildId: string,
    durationMinutes: number,
  ): Promise<boolean> {
    const activated = await services.valkey.set(
      ValkeyKeys.filterAutoLockdown(guildId),
      String(Date.now()),
      "EX",
      Math.max(60, durationMinutes * 60),
      "NX",
    );
    return activated === "OK";
  },

  /** Undo `activateAutoLockdown` when the lockdown could not actually be carried out. */
  async releaseAutoLockdown(services: Container, guildId: string): Promise<void> {
    await services.invalidation.invalidate(ValkeyKeys.filterAutoLockdown(guildId));
  }
});

export type FilterUtility = typeof filterUtility;

declare module "@lumi/lib/module-system/utility.js" {
  interface Utilities {
    filter: typeof filterUtility;
  }
}
