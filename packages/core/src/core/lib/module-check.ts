/**
 * Lightweight in-process cache for `areModulesEnabled` lookups.
 *
 * Multiple messageCreate listeners fire independently for the same Discord
 * event. Each listener calls `db.isModuleEnabled` which results in separate
 * Redis round-trips per module. This module consolidates those lookups:
 *
 * - All calls within WINDOW_MS (200ms) for the same guildId share a single
 *   batched Redis MGET via `db.areModulesEnabled`.
 * - After WINDOW_MS the entry is evicted so the next event gets a fresh result.
 *
 * Usage:
 *   import { checkModulesEnabled } from "#lib/module-check.js";
 *   const enabled = await checkModulesEnabled(guildId, ["afk", "filter"]);
 *   if (!enabled.get("afk")) return;
 */

import { container } from "@sapphire/framework";

const WINDOW_MS = 200;

interface Entry {
  promise: Promise<Map<string, boolean>>;
  modules: Set<string>;
  at: number;
}

const cache = new Map<string, Entry>();

/**
 * Returns the enabled state for all `modules` in `guildId`.
 * Concurrent calls within WINDOW_MS are coalesced into a single MGET.
 */
export async function checkModulesEnabled(
  guildId: string,
  modules: string[],
): Promise<Map<string, boolean>> {
  const now = Date.now();
  const existing = cache.get(guildId);

  // If a valid window entry exists and covers all requested modules, reuse it.
  if (existing && now - existing.at < WINDOW_MS) {
    const missing = modules.filter((m) => !existing.modules.has(m));
    if (missing.length === 0) return existing.promise;
  }

  // Start a new batch covering the requested modules.
  const moduleSet = new Set(modules);
  const promise = container.db.modules.areModulesEnabled(guildId, modules);
  cache.set(guildId, { promise, modules: moduleSet, at: now });

  // Auto-evict after the window expires.
  setTimeout(() => {
    if (cache.get(guildId)?.at === now) cache.delete(guildId);
  }, WINDOW_MS + 10);

  return promise;
}
