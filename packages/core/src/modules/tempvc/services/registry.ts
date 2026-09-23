import { container } from "@sapphire/framework";
import { logError } from "#lib/utilities/errors.js";
import type { GeneratorConfig } from "../data/tempvc.js";

/** Lightweight per-VC fact kept hot in memory for the voice event path. */
interface ManagedVc {
  generatorId: string;
  number: number;
}

/**
 * Process-local index of generator channels and active temp VCs, keyed by
 * guild. Discord routes all of a guild's gateway events (voice, interactions,
 * commands) to a single shard/process, so this index is authoritative for the
 * process that actually handles the guild - the hot voice path needs zero
 * network I/O after the first lazy hydration. The InvalidationBus keeps peer
 * processes (e.g. the GDPR bulk-delete or a dashboard RPC) in sync.
 */
class TempVcRegistry {
  readonly #gens = new Map<string, Map<string, GeneratorConfig>>();
  readonly #vcs = new Map<string, Map<string, ManagedVc>>();
  readonly #gensLoaded = new Set<string>();
  readonly #vcsLoaded = new Set<string>();
  readonly #genHydrating = new Map<string, Promise<void>>();
  readonly #vcHydrating = new Map<string, Promise<void>>();
  #wired = false;

  /** Subscribe to cluster invalidation. Idempotent; call once on ready. */
  public wire(): void {
    if (this.#wired) return;
    this.#wired = true;
    container.signals.onSignal((topic, payload) => {
      if (topic !== "tempvc") return;
      const g = payload.g;
      if (typeof g !== "string") return;
      if (payload.kind === "vcadd") {
        const c = payload.c;
        const gen = payload.gen;
        const n = payload.n;
        if (
          typeof c === "string" &&
          typeof gen === "string" &&
          typeof n === "number"
        ) {
          this.#localAddVc(g, c, { generatorId: gen, number: n });
        }
      } else if (payload.kind === "vcdel") {
        const c = payload.c;
        if (typeof c === "string") this.#vcs.get(g)?.delete(c);
      } else if (payload.kind === "vcreload") {
        this.#vcs.delete(g);
        this.#vcsLoaded.delete(g);
      } else if (payload.kind === "genreload") {
        this.#gens.delete(g);
        this.#gensLoaded.delete(g);
      }
    });

    container.invalidation.onResync(() => {
      this.#gens.clear();
      this.#vcs.clear();
      this.#gensLoaded.clear();
      this.#vcsLoaded.clear();
    });
  }

  public async getGenerator(
    guildId: string,
    channelId: string,
  ): Promise<GeneratorConfig | null> {
    await this.#ensureGens(guildId);
    return this.#gens.get(guildId)?.get(channelId) ?? null;
  }

  public async isManagedVc(
    guildId: string,
    channelId: string,
  ): Promise<boolean> {
    await this.#ensureVcs(guildId);
    return this.#vcs.get(guildId)?.has(channelId) ?? false;
  }

  /**
   * Smallest unused positive number for a generator, skipping any record whose
   * channel no longer exists so deleted slots are refilled.
   */
  public async nextNumber(
    guildId: string,
    generatorId: string,
    channelExists: (channelId: string) => boolean,
  ): Promise<number> {
    await this.#ensureVcs(guildId);
    const used = new Set<number>();
    const map = this.#vcs.get(guildId);
    if (map) {
      for (const [channelId, vc] of map) {
        if (vc.generatorId === generatorId && channelExists(channelId))
          used.add(vc.number);
      }
    }
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  public async addVc(
    guildId: string,
    channelId: string,
    vc: ManagedVc,
  ): Promise<void> {
    this.#localAddVc(guildId, channelId, vc);
    await this.#broadcast({
      kind: "vcadd",
      g: guildId,
      c: channelId,
      gen: vc.generatorId,
      n: vc.number,
    });
  }

  public async removeVc(guildId: string, channelId: string): Promise<void> {
    this.#vcs.get(guildId)?.delete(channelId);
    await this.#broadcast({ kind: "vcdel", g: guildId, c: channelId });
  }

  /** Generator config changed; drop the cached set so it re-hydrates. */
  public async invalidateGenerators(guildId: string): Promise<void> {
    this.#gens.delete(guildId);
    this.#gensLoaded.delete(guildId);
    await this.#broadcast({ kind: "genreload", g: guildId });
  }

  /** Drop the cached VC set for a guild (used after a bulk/foreign mutation). */
  public async reloadVcs(guildId: string): Promise<void> {
    this.#vcs.delete(guildId);
    this.#vcsLoaded.delete(guildId);
    await this.#broadcast({ kind: "vcreload", g: guildId });
  }

  #localAddVc(guildId: string, channelId: string, vc: ManagedVc): void {
    let map = this.#vcs.get(guildId);
    if (!map) {
      map = new Map();
      this.#vcs.set(guildId, map);
    }
    map.set(channelId, vc);
  }

  async #broadcast(
    payload: Record<string, string | number>,
  ): Promise<void> {
    await container.signals
      .publish("tempvc", payload)
      .catch((err: unknown) => logError("TempVC: registry broadcast", err));
  }

  async #ensureGens(guildId: string): Promise<void> {
    if (this.#gensLoaded.has(guildId)) return;
    let p = this.#genHydrating.get(guildId);
    if (!p) {
      p = (async () => {
        const rows = await container.db.tempvc.listGenerators(guildId);
        const map = new Map<string, GeneratorConfig>();
        for (const r of rows)
          map.set(r.channelId, { name: r.name, limit: r.limit });
        this.#gens.set(guildId, map);
        this.#gensLoaded.add(guildId);
      })()
        .catch((err: unknown) => logError("TempVC: generator hydrate", err))
        .finally(() => this.#genHydrating.delete(guildId));
      this.#genHydrating.set(guildId, p);
    }
    await p;
  }

  async #ensureVcs(guildId: string): Promise<void> {
    if (this.#vcsLoaded.has(guildId)) return;
    let p = this.#vcHydrating.get(guildId);
    if (!p) {
      p = (async () => {
        const rows = await container.db.tempvc.listRecords(guildId);
        const map = new Map<string, ManagedVc>();
        for (const r of rows) {
          map.set(r.channelId, {
            generatorId: r.generatorId,
            number: r.number,
          });
        }
        this.#vcs.set(guildId, map);
        this.#vcsLoaded.add(guildId);
      })()
        .catch((err: unknown) => logError("TempVC: record hydrate", err))
        .finally(() => this.#vcHydrating.delete(guildId));
      this.#vcHydrating.set(guildId, p);
    }
    await p;
  }
}

export const tempVcRegistry = new TempVcRegistry();
