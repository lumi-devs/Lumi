/**
 * Lightweight in-process cache for `areModulesEnabled` lookups.
 *
 * Multiple messageCreate listeners fire independently for the same Discord
 * event. Each listener calls `db.isModuleEnabled` which results in separate
 * Redis round-trips per module. This module consolidates those lookups:
 *
 * - All calls within WindowMs (200ms) for the same guildId share a single
 *   batched Redis MGET via `db.areModulesEnabled`.
 * - After WindowMs the entry is evicted so the next event gets a fresh result.
 *
 * Usage:
 *   import { checkModulesEnabled } from "#lib/module-check.js";
 *   const enabled = await checkModulesEnabled(guildId, ["afk", "filter"]);
 *   if (!enabled.get("afk")) return;
 */

import { container } from "@sapphire/framework";

const WindowMs = 200;

interface Entry {
  promise: Promise<Map<string, boolean>>;
  at: number;
}

const cache = new Map<string, Entry>();

function cacheKey(guildId: string, modules: string[]): string {
  return `${guildId}:${[...modules].sort().join(",")}`;
}

/**
 * Returns the enabled state for all `modules` in `guildId`.
 * Concurrent calls within WindowMs are coalesced into a single MGET.
 */
export async function checkModulesEnabled(
  guildId: string,
  modules: string[],
): Promise<Map<string, boolean>> {
  const now = Date.now();
  const key = cacheKey(guildId, modules);
  const existing = cache.get(key);

  if (existing && now - existing.at < WindowMs) {
    return existing.promise;
  }

  const promise = container.db.modules.areModulesEnabled(guildId, modules);
  cache.set(key, { promise, at: now });

  setTimeout(() => {
    if (cache.get(key)?.at === now) cache.delete(key);
  }, WindowMs + 10);

  return promise;
}
