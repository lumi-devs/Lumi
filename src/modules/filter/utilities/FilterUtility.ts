import { defineUtility } from "#src/lib/module-system/Utility.js";
import type { Container } from "#src/lib/Services.js";
import { CacheKeys } from "#src/lib/cache/Keys.js";
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
    _services: Container,
    guildId: string,
    userId: string,
    points: number,
    config: HeatConfig,
  ): Promise<number> {
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    const key = CacheKeys.filterHeat(guildId, userId);
    const now = Date.now();
    const stored = cacheStore.get<{ h: number; t: number }>(key);
    let cur = stored?.h ?? 0;
    const t = stored?.t ?? now;
    if (config.decayPerMinute > 0) {
      const minutes = Math.max(0, (now - t) / 60000);
      cur = Math.max(0, cur - minutes * config.decayPerMinute);
    }
    const nxt = cur + points;
    cacheStore.set(key, { h: nxt, t: now }, 3600 * 1000);
    return nxt;
  },

  async clearHeat(_services: Container, guildId: string, userId: string): Promise<void> {
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    cacheStore.delete(CacheKeys.filterHeat(guildId, userId));
  },

  async checkDuplicate(
    _services: Container,
    guildId: string,
    userId: string,
    content: string,
  ): Promise<{ exact: boolean; similarity: number }> {
    const trimmed = content.trim();
    if (trimmed.length === 0) return { exact: false, similarity: 0 };
    const capped = trimmed.slice(0, DuplicateContentCap);
    const key = CacheKeys.filterLastMsg(guildId, userId);
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    const prev = cacheStore.get<string>(key) ?? null;
    cacheStore.set(key, capped, DuplicateWindowSeconds * 1000);
    if (prev === null) return { exact: false, similarity: 0 };
    if (prev === capped) return { exact: true, similarity: 1 };
    return { exact: false, similarity: similarityRatio(prev, capped) };
  },

  async claimEscalation(
    _services: Container,
    guildId: string,
    userId: string,
    action: string,
  ): Promise<boolean> {
    const { claimCooldown } = await import("#src/lib/cache/Cooldown.js");
    return claimCooldown(
      `${CacheKeys.filterHeatActed(guildId, userId)}:${action}`,
      WarnCooldownSeconds * 1000,
    );
  },

  async recordViolation(_services: Container, guildId: string, userId: string): Promise<number> {
    const key = `filter:violation:${guildId}:${userId}`;
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    const current = cacheStore.get<number>(key) ?? 0;
    const nxt = current + 1;
    cacheStore.set(key, nxt, VIOLATION_RESET_SECONDS * 1000);
    return nxt;
  },

  async recordHeatPanicRaider(
    _services: Container,
    guildId: string,
    userId: string,
    config: Pick<HeatConfig, "panicWindowSeconds" | "panicRaiderCount">,
  ): Promise<boolean> {
    if (config.panicRaiderCount <= 0) return false;
    const key = CacheKeys.filterHeatPanicRaiders(guildId);
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    const set = cacheStore.get<Set<string>>(key) ?? new Set<string>();
    set.add(userId);
    cacheStore.set(key, set, config.panicWindowSeconds * 1000);
    if (set.size < config.panicRaiderCount) return false;

    cacheStore.set(
      CacheKeys.filterHeatPanicFlagged(guildId, userId),
      "1",
      HEAT_PANIC_FLAG_SECONDS * 1000,
    );
    const activeKey = CacheKeys.filterHeatPanicActive(guildId);
    if (!cacheStore.has(activeKey)) {
      cacheStore.set(activeKey, String(Date.now()), HEAT_PANIC_FLAG_SECONDS * 1000);
      return true;
    }
    return false;
  },

  async flagHeatPanicRaider(_services: Container, guildId: string, userId: string): Promise<void> {
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    cacheStore.set(
      CacheKeys.filterHeatPanicFlagged(guildId, userId),
      "1",
      HEAT_PANIC_FLAG_SECONDS * 1000,
    );
  },

  async isHeatPanicActive(_services: Container, guildId: string): Promise<boolean> {
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    return cacheStore.has(CacheKeys.filterHeatPanicActive(guildId));
  },

  async isFlaggedRaider(_services: Container, guildId: string, userId: string): Promise<boolean> {
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    return cacheStore.has(CacheKeys.filterHeatPanicFlagged(guildId, userId));
  },

  async recordMentions(
    _services: Container,
    guildId: string,
    count: number,
    windowSeconds: number,
  ): Promise<number> {
    if (count <= 0) return 0;
    const key = CacheKeys.filterMentionWindow(guildId);
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    const current = cacheStore.get<number>(key) ?? 0;
    const nxt = current + count;
    cacheStore.set(key, nxt, (windowSeconds > 0 ? windowSeconds : MENTION_WINDOW_DEFAULT_SECONDS) * 1000);
    return nxt;
  },

  async activateAutoLockdown(
    _services: Container,
    guildId: string,
    durationMinutes: number,
  ): Promise<boolean> {
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    const key = CacheKeys.filterAutoLockdown(guildId);
    if (cacheStore.has(key)) return false;
    cacheStore.set(key, String(Date.now()), Math.max(60, durationMinutes * 60) * 1000);
    return true;
  },

  async releaseAutoLockdown(_services: Container, guildId: string): Promise<void> {
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    cacheStore.delete(CacheKeys.filterAutoLockdown(guildId));
  }
});

export type FilterUtility = typeof filterUtility;

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    filter: typeof filterUtility;
  }
}
