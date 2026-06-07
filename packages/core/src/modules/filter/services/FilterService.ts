import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
// @ts-expect-error - ahocorasick does not provide type declarations
import AhoCorasick from "ahocorasick";
import { parseConfigList } from "#core/module-system/Module.js";

interface AhoMatcher {
  search(text: string): Array<[number, string[]]>;
}

@ApplyOptions<Piece.Options>({ name: "filter" })
export class FilterService extends Service {
  // Per-guild compiled automaton. `null` means "loaded, but no terms" — distinct
  // from "not loaded yet" (absent key), so a guild with an empty filter doesn't
  // trigger a reload on every message. Insertion order doubles as LRU order;
  // touch() re-inserts to mark recency.
  private readonly _guilds = new Map<string, AhoMatcher | null>();

  public async loadGuild(guildId: string): Promise<void> {
    const terms = parseConfigList(
      await this.container.db.config.getModuleConfig(
        guildId,
        "filter",
        "terms",
      ),
    );
    this.rebuild(guildId, terms);
  }

  public rebuild(guildId: string, terms: string[]): void {
    this._guilds.delete(guildId);
    this._guilds.set(
      guildId,
      terms.length > 0 ? (new AhoCorasick(terms) as AhoMatcher) : null,
    );
    this.#evictIfNeeded();
  }

  public has(guildId: string): boolean {
    return this._guilds.has(guildId);
  }

  public test(guildId: string, text: string): string | null {
    if (!this._guilds.has(guildId)) return null;
    const matcher = this.#touch(guildId);
    if (!matcher) return null;
    const results = matcher.search(text.toLowerCase());
    return results[0]?.[1]?.[0] ?? null;
  }

  public evict(guildId: string): void {
    this._guilds.delete(guildId);
  }

  /** Mark a guild as most-recently-used and return its matcher. */
  #touch(guildId: string): AhoMatcher | null {
    const matcher = this._guilds.get(guildId) ?? null;
    this._guilds.delete(guildId);
    this._guilds.set(guildId, matcher);
    return matcher;
  }

  #evictIfNeeded(): void {
    while (this._guilds.size > FilterService.MAX_GUILDS) {
      // Map iteration order is insertion order → first key is LRU.
      const oldest = this._guilds.keys().next().value;
      if (oldest === undefined) break;
      this._guilds.delete(oldest);
    }
  }

  // Cap the number of resident automatons so a bot in many guilds can't grow
  // _guilds without bound. Eviction is LRU: when full, the least-recently-used
  // guild is dropped and simply reloaded from config on its next message (a
  // cache miss, not a correctness change).
  private static readonly MAX_GUILDS = 10_000;
}
