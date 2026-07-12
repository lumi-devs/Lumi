import { Service, getService } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
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
  private readonly _guilds = new Map<string, CompiledRules | null>();

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
      const oldest = this._guilds.keys().next().value;
      if (oldest === undefined) break;
      this._guilds.delete(oldest);
    }
  }

  private static readonly MAX_GUILDS = 10_000;
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    filter: FilterService;
  }
}
