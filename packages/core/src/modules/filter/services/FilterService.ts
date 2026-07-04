import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { parseConfigList } from "#core/module-system/Module.js";
import {
  compileRules,
  evaluate,
  DEFAULT_CAPS_MIN_LENGTH,
  type CompiledRules,
  type FilterHit,
  type RuleConfig,
} from "../lib/rules.js";

@ApplyOptions<Piece.Options>({ name: "filter" })
export class FilterService extends Service {
  // Per-guild compiled rule set. `null` means "loaded, but nothing enabled" —
  // distinct from "not loaded yet" (absent key), so a guild with no filter
  // config doesn't trigger a reload on every message. Insertion order doubles
  // as LRU order; touch() re-inserts to mark recency.
  private readonly _guilds = new Map<string, CompiledRules | null>();

  public async loadGuild(guildId: string): Promise<void> {
    const cfg = this.container.db.config;
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
      cfg.getModuleConfig(guildId, "filter", "terms"),
      cfg.getModuleConfig(guildId, "filter", "regex_rules"),
      cfg.getModuleConfig(guildId, "filter", "block_invites"),
      cfg.getModuleConfig(guildId, "filter", "invite_allowlist"),
      cfg.getModuleConfig(guildId, "filter", "block_links"),
      cfg.getModuleConfig(guildId, "filter", "link_allowlist"),
      cfg.getModuleConfig(guildId, "filter", "max_mentions"),
      cfg.getModuleConfig(guildId, "filter", "max_caps_percent"),
      cfg.getModuleConfig(guildId, "filter", "caps_min_length"),
    ]);

    this.rebuild(guildId, {
      terms: parseConfigList(terms),
      regexRules: parseConfigList(regexRules),
      blockInvites: blockInvites === true,
      inviteAllowlist: parseConfigList(inviteAllowlist),
      blockLinks: blockLinks === true,
      linkAllowlist: parseConfigList(linkAllowlist),
      maxMentions: typeof maxMentions === "number" ? maxMentions : 0,
      maxCapsPercent: typeof maxCapsPercent === "number" ? maxCapsPercent : 0,
      capsMinLength:
        typeof capsMinLength === "number"
          ? capsMinLength
          : DEFAULT_CAPS_MIN_LENGTH,
    });
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
    this.#evictIfNeeded();
  }

  public has(guildId: string): boolean {
    return this._guilds.has(guildId);
  }

  public test(
    guildId: string,
    content: string,
    mentionCount: number,
  ): FilterHit | null {
    if (!this._guilds.has(guildId)) return null;
    const rules = this.#touch(guildId);
    if (!rules) return null;
    return evaluate(rules, content, mentionCount);
  }

  public evict(guildId: string): void {
    this._guilds.delete(guildId);
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
      // Map iteration order is insertion order → first key is LRU.
      const oldest = this._guilds.keys().next().value;
      if (oldest === undefined) break;
      this._guilds.delete(oldest);
    }
  }

  // Cap the number of resident rule sets so a bot in many guilds can't grow
  // _guilds without bound. Eviction is LRU: when full, the least-recently-used
  // guild is dropped and simply reloaded from config on its next message (a
  // cache miss, not a correctness change).
  private static readonly MAX_GUILDS = 10_000;
}

declare module "#core/module-system/Service.js" {
  interface Services {
    filter: FilterService;
  }
}
