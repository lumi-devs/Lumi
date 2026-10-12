import { defineUtility } from "#src/lib/module-system/Utility.js";
import type { Container } from "#src/lib/Services.js";
import { ValkeyKeys } from "#src/lib/valkey/Store.js";
import { toStringArray } from "#src/lib/module-system/ConfigSchema.js";
import {
  compileRules,
  evaluateStatic,
  evaluateTerms,
  DefaultCapsMinLength,
  type CompiledRules,
  type FilterHit,
  type RuleConfig,
} from "#src/modules/filter/services/Rules.js";
import { type HeatConfig } from "#src/modules/filter/services/Heat.js";
import {
  getRegexWorker,
  RegexTimeoutError,
  RegexWorkerUnavailableError,
} from "#src/lib/regex-worker/Handler.js";

const DuplicateWindowSeconds = 30;
const WarnCooldownSeconds = 30;

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

const DuplicateContentCap = 300;

const SimilarityCompareCap = 200;

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

  getHeat(guildId: string): HeatConfig | undefined {
    return heatByGuild.get(guildId);
  },

  has(guildId: string): boolean {
    return compiledByGuild.has(guildId);
  },

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

  async addHeat(
    services: Container,
    guildId: string,
    userId: string,
    points: number,
    config: HeatConfig,
  ): Promise<number> {
    const key = ValkeyKeys.filterHeat(guildId, userId);
    const now = Date.now();
    return Number.parseFloat(
      (await services.valkey.eval(
        AddHeatScript,
        1,
        key,
        String(now),
        String(config.decayPerMinute),
        String(points),
      )) as string,
    );
  },

  async clearHeat(services: Container, guildId: string, userId: string): Promise<void> {
    await services.invalidation.invalidate(ValkeyKeys.filterHeat(guildId, userId));
  },

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

  async recordViolation(services: Container, guildId: string, userId: string): Promise<number> {
    const key = ValkeyKeys.filterHeatViolations(guildId, userId);
    const results = await services.valkey
      .multi()
      .incr(key)
      .expire(key, VIOLATION_RESET_SECONDS)
      .exec();
    return (results?.[0]?.[1] as number) ?? 1;
  },

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

  async releaseAutoLockdown(services: Container, guildId: string): Promise<void> {
    await services.invalidation.invalidate(ValkeyKeys.filterAutoLockdown(guildId));
  }
});

export type FilterUtility = typeof filterUtility;

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    filter: typeof filterUtility;
  }
}
