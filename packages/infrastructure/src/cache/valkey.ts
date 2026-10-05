import Valkey, { Cluster, Command, type RedisOptions } from "iovalkey";
import { performance } from "perf_hooks";
import { delSafe, type ValkeyClient } from "../database/cluster-safe.js";
import type { CacheLogger, ValkeyConnectionConfig, ResyncContext } from "./types.js";

export type ValkeyOptions = RedisOptions;
export type { ValkeyClient };

function tryParseJSON(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export const ValkeyKeys = {
  guildSettings: (guildId: string) => `lumi:settings:guild:${guildId}`,
  guildConfig: (module: string, guildId: string) =>
    `lumi:cfg:${module}:guild:${guildId}`,
  guildAllModuleConfigs: (guildId: string) =>
    `lumi:cfg:all:guild:${guildId}`,
  globalConfig: () => "lumi:cfg:global",

  moduleEnabled: (module: string, guildId: string) =>
    `lumi:module:enabled:${module}:${guildId}`,
  moduleGlobalEnabled: (module: string) =>
    `lumi:module:global:enabled:${module}`,

  permOverrides: (commandPath: string, guildId: string) =>
    `lumi:perms:${commandPath}:${guildId}`,
  targetPermits: (
    guildId: string,
    targetType: "user" | "role" | "channel",
    targetId: string,
  ) => `lumi:permits:${guildId}:${targetType}:${targetId}`,
  guildPermitsPattern: (guildId: string) => `lumi:permits:${guildId}:*`,
  quarantineState: (guildId: string, userId: string) =>
    `lumi:mod:${guildId}:quarantine:${userId}`,
  securityWindow: (guildId: string, executorId: string, kind: string) =>
    `lumi:security:${guildId}:window:${kind}:${executorId}`,
  securityTripped: (guildId: string, executorId: string, kind: string) =>
    `lumi:security:${guildId}:tripped:${kind}:${executorId}`,
  joinBurst: (guildId: string) => `lumi:security:${guildId}:joins`,
  raidMode: (guildId: string) => `lumi:security:${guildId}:raid`,
  recentJoiners: (guildId: string) => `lumi:security:${guildId}:recent-joiners`,
  verifyChallenge: (guildId: string, userId: string) =>
    `lumi:security:${guildId}:verify:${userId}`,
  verifyPending: (guildId: string) => `lumi:security:${guildId}:verify:pending`,
  panicState: (guildId: string) => `lumi:security:${guildId}:panic`,
  securityRestorePending: (guildId: string) =>
    `lumi:security:${guildId}:restore-pending`,
  voiceMuteState: (guildId: string, userId: string) =>
    `lumi:mod:${guildId}:voicemute:${userId}`,
  filterHeat: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:heat:${userId}`,
  filterHeatActed: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:heatacted:${userId}`,
  filterLastMsg: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:lastmsg:${userId}`,
  filterHeatViolations: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:violations:${userId}`,
  filterHeatPanicRaiders: (guildId: string) =>
    `lumi:filter:${guildId}:heatpanic:raiders`,
  filterHeatPanicActive: (guildId: string) =>
    `lumi:filter:${guildId}:heatpanic:active`,
  filterHeatPanicFlagged: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:heatpanic:flagged:${userId}`,
  filterMentionWindow: (guildId: string) =>
    `lumi:filter:${guildId}:mentionwindow`,
  filterAutoLockdown: (guildId: string) =>
    `lumi:filter:${guildId}:autolockdown`,
  blocked: (guildId: string | null, userId: string) =>
    `lumi:block:${guildId ?? "global"}:${userId}`,
  blockedPattern: (userId: string) => `lumi:block:*:${userId}`,
  guildIgnored: (guildId: string) => `lumi:ignore:guild:${guildId}`,
  channelIgnored: (guildId: string, channelId: string) =>
    `lumi:ignore:channel:${guildId}:${channelId}`,
  logClaimCode: (guildId: string, code: string) =>
    `lumi:logging:${guildId}:claimcode:${code}`,
  logClaim: (guildId: string, channelId: string) =>
    `lumi:logging:${guildId}:claim:${channelId}`,
  logClaimIndex: (guildId: string) => `lumi:logging:${guildId}:claims`,

  restGuild: (guildId: string) => `lumi:rest:guild:${guildId}`,
  restMember: (guildId: string, userId: string) =>
    `lumi:rest:member:${guildId}:${userId}`,
  restChannel: (channelId: string) => `lumi:rest:channel:${channelId}`,
  restGuildRoles: (guildId: string) => `lumi:rest:guild:${guildId}:roles`,
  restGuildChannels: (guildId: string) => `lumi:rest:guild:${guildId}:channels`,
  restGuildMembersSample: (guildId: string, limit: number) =>
    `lumi:rest:guild:${guildId}:members:${limit}`,

  botStats: () => "lumi:stats:bot",

  auditLogsQueue: (bucket: number) => `lumi:queue:audit_logs:{${bucket}}`,

  schedulerLeader: () => "lumi:scheduler:leader",
  schedulerHeartbeat: () => "lumi:scheduler:heartbeat",

  addonUpdateCheck: () => "lumi:addon:update-check",

  rpcIdempotency: (action: string, guildId: string, hash: string) =>
    `lumi:rpc:idem:${action}:${guildId}:${hash}`,

  featureFlagEval: (key: string) => `lumi:flags:eval:${key}`,
  featureFlagOverride: (key: string, guildId: string) =>
    `lumi:flags:override:${key}:${guildId}`,
} as const;

export const ValkeyTTL = {
  guildConfig: 60,
  guildAllModuleConfigs: 60,
  globalConfig: 120,
  guildPrefix: 60,
  permOverrides: 120,
  permits: 120,
  moduleEnabledCache: 30,
  blockedCache: 300,
  ignoreCache: 300,
  botStats: 15,
  voiceMute: 300,
  quarantine: 30 * 24 * 60 * 60,
  quarantineNegative: 60,
  warnThresholds: 300,
  warnCount: 365 * 24 * 3600,
  voiceOccupancy: 24 * 60 * 60,
  addonUpdateCheck: 300,
  logClaimCode: 600,
  logClaim: 24 * 60 * 60,

  restGuild: 20,
  restMember: 20,
  restChannel: 20,
  restGuildRoles: 20,
  restGuildChannels: 20,
  restGuildMembersSample: 20,

  rpcIdempotencyDone: 5 * 60,

  featureFlagEval: 30,
  featureFlagOverride: 30,
} as const;

export function valkeyConnectionOptions(
  config?: ValkeyConnectionConfig,
): ValkeyOptions {
  const url = config?.url ?? process.env.VALKEY_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      const isTls = parsed.protocol === "rediss:" || parsed.protocol === "valkeys:";
      const host = parsed.hostname || "localhost";
      const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
      const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
      const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      const dbMatch = parsed.pathname.match(/^\/(\d+)$/);
      const db = dbMatch ? parseInt(dbMatch[1]!, 10) : undefined;

      return {
        host,
        port,
        ...(username && { username }),
        ...(password && { password }),
        ...(db !== undefined && { db }),
        ...(isTls && { tls: {} }),
      };
    } catch {
      // Fall through to standard option parsing if URL parsing fails
    }
  }

  const envSentinels = config?.sentinels ?? process.env.VALKEY_SENTINELS;
  const envPassword = config?.password ?? process.env.VALKEY_PASSWORD ?? "";
  const password = envPassword.length > 0 ? envPassword : undefined;

  if (envSentinels) {
    const sentinels = envSentinels
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [host, port] = entry.split(":");
        if (!host || !port) {
          throw new Error(`[Valkey] Invalid VALKEY_SENTINELS entry: ${entry}`);
        }
        const portNum = Number(port);
        if (!Number.isFinite(portNum)) {
          throw new Error(`[Valkey] Invalid VALKEY_SENTINELS port: ${entry}`);
        }
        return { host, port: portNum };
      });
    if (sentinels.length === 0) {
      throw new Error("[Valkey] VALKEY_SENTINELS is empty");
    }
    const sentinelPassword =
      config?.sentinelPassword ?? process.env.VALKEY_SENTINEL_PASSWORD ?? undefined;
    return {
      sentinels,
      name: config?.sentinelName ?? process.env.VALKEY_SENTINEL_NAME ?? "mymaster",
      ...(password && { password }),
      ...(sentinelPassword && { sentinelPassword }),
    };
  }

  const portVal =
    config?.port ??
    (process.env.VALKEY_PORT ? parseInt(process.env.VALKEY_PORT, 10) : 6379);

  return {
    host: config?.host ?? process.env.VALKEY_HOST ?? "localhost",
    port: Number.isFinite(portVal) ? portVal : 6379,
    ...(password && { password }),
  };
}

export function parseValkeyConnectionOption(
  config?: ValkeyConnectionConfig,
): ValkeyOptions {
  return {
    ...valkeyConnectionOptions(config),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

const BLOCKING_COMMANDS = new Set([
  "blpop",
  "brpop",
  "brpoplpush",
  "blmove",
  "bzpopmin",
  "bzpopmax",
  "xread",
  "xreadgroup",
  "wait",
]);

export function instrumentValkeyLatency(
  client: ValkeyClient,
  onDuration?: (command: string, seconds: number) => void,
): ValkeyClient {
  if (!onDuration) return client;

  const sendCommand = client.sendCommand.bind(client);
  client.sendCommand = (command: Command, stream?: unknown, node?: unknown) => {
    if (command.name && BLOCKING_COMMANDS.has(command.name.toLowerCase())) {
      return sendCommand(command, stream as never, node as never);
    }
    const start = performance.now();
    const record = () => {
      onDuration(command.name, (performance.now() - start) / 1000);
    };
    command.promise.then(record, record);
    return sendCommand(command, stream as never, node as never);
  };
  return client;
}

export interface CreateValkeyClientOptions {
  config?: ValkeyConnectionConfig;
  logger?: CacheLogger;
  onDuration?: (command: string, seconds: number) => void;
}

export function createValkeyClient(
  options: CreateValkeyClientOptions = {},
): ValkeyClient {
  const { config, logger, onDuration } = options;
  const clusterNodesEnv = config?.clusterNodes ?? process.env.VALKEY_CLUSTER_NODES;
  const nodes = clusterNodesEnv
    ? clusterNodesEnv
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
          const [host, port] = entry.split(":");
          return { host: host ?? "localhost", port: port ? parseInt(port, 10) : 6379 };
        })
    : null;

  const cacheDbVal =
    config?.cacheDb ??
    (process.env.VALKEY_CACHE_DB ? parseInt(process.env.VALKEY_CACHE_DB, 10) : 0);

  const client: ValkeyClient = nodes && nodes.length > 0
    ? new Cluster(nodes, {
        lazyConnect: true,
        scaleReads:
          config?.clusterScaleReads ??
          (process.env.VALKEY_CLUSTER_SCALE_READS as "master" | "slave" | "all" | undefined) ??
          "master",
        slotsRefreshTimeout: 2000,
        clusterRetryStrategy: (times: number) =>
          Math.min(100 * Math.pow(2, times), 2000),
        redisOptions: {
          ...valkeyConnectionOptions(config),
          maxRetriesPerRequest: 3,
        },
      })
    : new Valkey({
        ...valkeyConnectionOptions(config),
        db: Number.isFinite(cacheDbVal) ? cacheDbVal : 0,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });

  client.on("error", (err: unknown) => logger?.error?.("[Valkey] Error:", err));
  client.on("connect", () => logger?.debug?.("[Valkey] Connected"));
  client.on("reconnecting", () => logger?.warn?.("[Valkey] Reconnecting..."));

  return instrumentValkeyLatency(client, onDuration);
}

const InvalidationChannel = "lumi:cache:invalidate";

export class InvalidationBus {
  readonly #subscriber: ValkeyClient;
  #publisher: ValkeyClient | null;
  readonly #logger?: CacheLogger;
  #listeners = new Set<(keys: string[]) => void>();
  #resyncListeners = new Set<(ctx: ResyncContext) => void | Promise<void>>();
  #started = false;
  #startPromise: Promise<void> | null = null;
  #handlerAttached = false;
  #connectionDropped = false;
  #lastInvalidationTime = 0;

  public constructor(
    subscriber: ValkeyClient,
    publisher?: ValkeyClient | null,
    logger?: CacheLogger,
  ) {
    this.#subscriber = subscriber;
    this.#publisher = publisher ?? null;
    this.#logger = logger;
  }

  public setPublisher(publisher: ValkeyClient): void {
    this.#publisher = publisher;
  }

  public onInvalidate(fn: (keys: string[]) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  public onResync(fn: (ctx: ResyncContext) => void | Promise<void>): () => void {
    this.#resyncListeners.add(fn);
    return () => this.#resyncListeners.delete(fn);
  }

  public start(): Promise<void> {
    if (this.#started) return Promise.resolve();
    this.#startPromise ??= this.#doStart().finally(() => {
      this.#startPromise = null;
    });
    return this.#startPromise;
  }

  /** Delete locally and broadcast to peers. */
  public async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const publisher = this.#publisher;
    if (!publisher) {
      this.#logger?.warn?.("[InvalidationBus] Invalidation attempted without publisher");
      return;
    }
    await delSafe(publisher, keys);
    await publisher.publish(
      InvalidationChannel,
      JSON.stringify({ keys, time: Date.now() }),
    );
  }

  public async stop(): Promise<void> {
    if (!this.#started) return;
    await this.#subscriber
      .unsubscribe(InvalidationChannel)
      .catch((err: unknown) => this.#logger?.error?.("Valkey: unsubscribe failed", err));
    this.#started = false;
  }

  public async close(): Promise<void> {
    await this.stop();
    if (this.#handlerAttached) {
      this.#subscriber.removeListener?.("message", this.#onMessage);
      this.#subscriber.removeListener?.("close", this.#onClose);
      this.#subscriber.removeListener?.("ready", this.#onReady);
      this.#handlerAttached = false;
    }
    this.#listeners.clear();
    this.#resyncListeners.clear();
    await this.#subscriber
      .quit()
      .catch((err: unknown) => this.#logger?.error?.("Valkey: quit failed", err));
  }

  async #doStart(): Promise<void> {
    if (this.#started) return;
    if (!this.#handlerAttached) {
      this.#subscriber.on("message", this.#onMessage);
      this.#subscriber.on("close", this.#onClose);
      this.#subscriber.on("ready", this.#onReady);
      this.#handlerAttached = true;
    }
    await this.#subscriber.subscribe(InvalidationChannel);
    this.#started = true;
  }

  #onMessage = (_channel: string, payload: string) => {
    const parsed = tryParseJSON(payload) as {
      keys?: unknown;
      time?: unknown;
    } | null;
    if (!parsed || !Array.isArray(parsed.keys)) return;
    if (
      typeof parsed.time === "number" &&
      parsed.time > this.#lastInvalidationTime
    ) {
      this.#lastInvalidationTime = parsed.time;
    }
    const validKeys = parsed.keys.filter(
      (k): k is string => typeof k === "string" && k.length > 0,
    );
    if (validKeys.length === 0) return;
    for (const fn of this.#listeners) fn(validKeys);
  };

  #onClose = () => {
    if (this.#started) this.#connectionDropped = true;
  };

  #onReady = () => {
    if (!this.#connectionDropped) return;
    this.#connectionDropped = false;
    const ctx: ResyncContext = { cutoff: this.#lastInvalidationTime };
    for (const fn of this.#resyncListeners) {
      Promise.resolve(fn(ctx)).catch((err: unknown) =>
        this.#logger?.error?.("Valkey: invalidation resync failed", err),
      );
    }
  };
}

const SignalsChannel = "lumi:signals";

export class SignalBus {
  readonly #subscriber: ValkeyClient;
  #publisher: ValkeyClient | null;
  readonly #logger?: CacheLogger;
  #listeners = new Set<
    (topic: string, payload: Record<string, string | number>) => void
  >();
  #started = false;
  #startPromise: Promise<void> | null = null;
  #handlerAttached = false;

  public constructor(
    subscriber: ValkeyClient,
    publisher?: ValkeyClient | null,
    logger?: CacheLogger,
  ) {
    this.#subscriber = subscriber;
    this.#publisher = publisher ?? null;
    this.#logger = logger;
  }

  public setPublisher(publisher: ValkeyClient): void {
    this.#publisher = publisher;
  }

  public onSignal(
    fn: (topic: string, payload: Record<string, string | number>) => void,
  ): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  public start(): Promise<void> {
    if (this.#started) return Promise.resolve();
    this.#startPromise ??= this.#doStart().finally(() => {
      this.#startPromise = null;
    });
    return this.#startPromise;
  }

  public async publish(
    topic: string,
    payload: Record<string, string | number>,
  ): Promise<void> {
    const publisher = this.#publisher;
    if (!publisher) {
      this.#logger?.warn?.("[SignalBus] Publish attempted without publisher");
      return;
    }
    await publisher.publish(
      SignalsChannel,
      JSON.stringify({ topic, payload, time: Date.now() }),
    );
  }

  public async stop(): Promise<void> {
    if (!this.#started) return;
    await this.#subscriber
      .unsubscribe(SignalsChannel)
      .catch((err: unknown) => this.#logger?.error?.("Valkey: unsubscribe failed", err));
    this.#started = false;
  }

  public async close(): Promise<void> {
    await this.stop();
    if (this.#handlerAttached) {
      this.#subscriber.removeListener?.("message", this.#onMessage);
      this.#handlerAttached = false;
    }
    this.#listeners.clear();
    await this.#subscriber
      .quit()
      .catch((err: unknown) => this.#logger?.error?.("Valkey: quit failed", err));
  }

  async #doStart(): Promise<void> {
    if (this.#started) return;
    if (!this.#handlerAttached) {
      this.#subscriber.on("message", this.#onMessage);
      this.#handlerAttached = true;
    }
    await this.#subscriber.subscribe(SignalsChannel);
    this.#started = true;
  }

  #onMessage = (_channel: string, payload: string) => {
    const parsed = tryParseJSON(payload) as {
      topic?: unknown;
      payload?: unknown;
      time?: unknown;
    } | null;
    if (!parsed || typeof parsed.topic !== "string") return;
    if (
      !parsed.payload ||
      typeof parsed.payload !== "object" ||
      Array.isArray(parsed.payload)
    ) {
      return;
    }
    for (const fn of this.#listeners) {
      fn(parsed.topic, parsed.payload as Record<string, string | number>);
    }
  };
}
