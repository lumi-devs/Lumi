// Dynamic IShardingStrategy that supports in-place shard add/remove on cluster
// rebalance, so a gateway replica can take over an orphaned shard (or hand one
// off) without process restart.
//
// `SimpleShardingStrategy` keeps its shard map private and only exposes a
// manager-wide destroy(). We re-implement the same surface and add
// `addShards()`/`removeShards()` for the rebalance path. RESUME still works
// because per-shard session info lives in `RedisSessionStore` — when a shard
// moves from gw-a to gw-b, gw-b's retrieveSessionInfo for that shard returns
// the cached session and the new WS RESUMEs instead of IDENTIFYing.
//
// Limitations: the host `WebSocketManager` caches `shardCount` and the initial
// `shardIds` list internally. This strategy bypasses the cached list (the
// manager only calls back into the strategy for send/fetch), but a *re-shard*
// (shardCount change) still requires a process restart — only per-shard
// membership churn is in-place. That matches the actual scale-out need:
// rebalances are routine, re-shards are rare events tied to guild-count growth.

import {
  WebSocketShard,
  WebSocketShardEvents,
  SimpleContextFetchingStrategy,
  managerToFetchingStrategyOptions,
  type IShardingStrategy,
  type WebSocketManager,
  type WebSocketShardDestroyOptions,
  type WebSocketShardStatus,
  type FetchingStrategyOptions,
} from "@discordjs/ws";
import { Collection } from "@discordjs/collection";
import type { GatewaySendPayload } from "discord-api-types/v10";

export class DynamicShardingStrategy implements IShardingStrategy {
  private readonly shards = new Collection<number, WebSocketShard>();
  private cachedOptions: FetchingStrategyOptions | null = null;
  private connected = false;

  public constructor(private readonly manager: WebSocketManager) {}

  /** Number of shards currently owned by this strategy (visible to callers). */
  public ownedShardIds(): number[] {
    return [...this.shards.keys()];
  }

  public async spawn(shardIds: number[]): Promise<void> {
    const opts = await this.#ensureOptions();
    for (const shardId of shardIds) {
      if (this.shards.has(shardId)) continue;
      this.#createShard(shardId, opts);
    }
  }

  public async connect(): Promise<void> {
    this.connected = true;
    await Promise.all(
      [...this.shards.values()].map((shard) => shard.connect()),
    );
  }

  public async destroy(
    options?: Omit<WebSocketShardDestroyOptions, "recover">,
  ): Promise<void> {
    this.connected = false;
    await Promise.all(
      [...this.shards.values()].map((shard) => shard.destroy(options)),
    );
    this.shards.clear();
  }

  public async send(
    shardId: number,
    payload: GatewaySendPayload,
  ): Promise<void> {
    const shard = this.shards.get(shardId);
    if (!shard)
      throw new RangeError(`Shard ${shardId} not owned by this strategy`);
    return shard.send(payload);
  }

  public fetchStatus(): Collection<number, WebSocketShardStatus> {
    return this.shards.mapValues((shard) => shard.status);
  }

  /**
   * Spawn + connect additional shards in-place. Idempotent: any id already
   * owned is skipped. Safe to call before or after the initial connect().
   */
  public async addShards(shardIds: readonly number[]): Promise<void> {
    if (shardIds.length === 0) return;
    const opts = await this.#ensureOptions();
    const fresh: WebSocketShard[] = [];
    for (const shardId of shardIds) {
      if (this.shards.has(shardId)) continue;
      fresh.push(this.#createShard(shardId, opts));
    }
    if (this.connected) {
      await Promise.all(fresh.map((s) => s.connect()));
    }
  }

  /**
   * Gracefully destroy the listed shards without touching the rest. Unknown
   * ids are silently ignored so the caller can replay a rebalance delta
   * without first reconciling against ownedShardIds().
   */
  public async removeShards(
    shardIds: readonly number[],
    options?: Omit<WebSocketShardDestroyOptions, "recover">,
  ): Promise<void> {
    if (shardIds.length === 0) return;
    const toDestroy: WebSocketShard[] = [];
    for (const shardId of shardIds) {
      const shard = this.shards.get(shardId);
      if (!shard) continue;
      toDestroy.push(shard);
      this.shards.delete(shardId);
    }
    await Promise.all(toDestroy.map((s) => s.destroy(options)));
  }

  async #ensureOptions(): Promise<FetchingStrategyOptions> {
    if (!this.cachedOptions) {
      this.cachedOptions = await managerToFetchingStrategyOptions(this.manager);
    }
    return this.cachedOptions;
  }

  #createShard(shardId: number, opts: FetchingStrategyOptions): WebSocketShard {
    const ctx = new SimpleContextFetchingStrategy(this.manager, opts);
    const shard = new WebSocketShard(ctx, shardId);
    // Relay every shard-level event up to the manager so consumers wiring
    // `manager.on(WebSocketShardEvents.Ready, ...)` keep working unchanged.
    for (const event of Object.values(WebSocketShardEvents)) {
      shard.on(event, (...args: unknown[]) =>
        (
          this.manager as unknown as { emit(e: string, ...a: unknown[]): void }
        ).emit(event, ...args, shardId),
      );
    }
    this.shards.set(shardId, shard);
    return shard;
  }
}
