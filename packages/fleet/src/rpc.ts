import type { Redis } from "ioredis";
import { EventEmitter } from "events";

export interface RpcRequest {
  id: string;
  method: string;
  params: any;
  timeout: number;
  targetShards: number[] | "all";
}

export interface RpcResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  fromShard: number;
}

export interface RpcHandler {
  (params: any): Promise<any>;
}

export class CrossShardRpc extends EventEmitter {
  private readonly redis: Redis;
  private readonly workerId: string;
  private readonly shardIds: number[];
  private readonly handlers: Map<string, RpcHandler> = new Map();
  private readonly pendingRequests: Map<string, { resolve: (v: RpcResponse) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private subscriber?: Redis;
  private publisher?: Redis;

  constructor(redis: Redis, workerId: string, shardIds: number[]) {
    super();
    this.redis = redis;
    this.workerId = workerId;
    this.shardIds = shardIds;
  }

  async start(): Promise<void> {
    // Create separate connections for pub/sub
    this.subscriber = this.redis.duplicate();
    this.publisher = this.redis.duplicate();
    
    await this.subscriber.connect();
    await this.publisher.connect();

    // Subscribe to RPC channels
    await this.subscriber.subscribe("lumi:rpc:request", "lumi:rpc:response");
    
    this.subscriber.on("message", (channel, message) => {
      if (channel === "lumi:rpc:request") {
        this.handleRequest(JSON.parse(message));
      } else if (channel === "lumi:rpc:response") {
        this.handleResponse(JSON.parse(message));
      }
    });
  }

  registerHandler(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  unregisterHandler(method: string): void {
    this.handlers.delete(method);
  }

  private async handleRequest(data: RpcRequest): Promise<void> {
    // Check if this worker should handle the request
    const shouldHandle = data.targetShards === "all" || 
      data.targetShards.some(s => this.shardIds.includes(s));

    if (!shouldHandle) return;

    const handler = this.handlers.get(data.method);
    if (!handler) {
      this.sendResponse({
        id: data.id,
        success: false,
        error: `Method not found: ${data.method}`,
        fromShard: this.shardIds[0],
      });
      return;
    }

    try {
      const result = await handler(data.params);
      this.sendResponse({
        id: data.id,
        success: true,
        result,
        fromShard: this.shardIds[0],
      });
    } catch (error: any) {
      this.sendResponse({
        id: data.id,
        success: false,
        error: error.message,
        fromShard: this.shardIds[0],
      });
    }
  }

  private handleResponse(data: RpcResponse): void {
    const pending = this.pendingRequests.get(data.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(data.id);
      if (data.success) {
        pending.resolve(data);
      } else {
        pending.reject(new Error(data.error || "RPC call failed"));
      }
    }
  }

  private sendResponse(response: RpcResponse): void {
    this.publisher!.publish("lumi:rpc:response", JSON.stringify(response));
  }

  async call(method: string, params: any, options: { targetShards?: number[] | "all"; timeout?: number } = {}): Promise<RpcResponse[]> {
    const requestId = crypto.randomUUID();
    const targetShards = options.targetShards ?? "all";
    const timeout = options.timeout ?? 10000;

    const request: RpcRequest = {
      id: requestId,
      method,
      params,
      timeout,
      targetShards,
    };

    // Determine which workers to send to
    const targetChannels = targetShards === "all" 
      ? ["lumi:rpc:request"] 
      : this.shardIds.filter(s => targetShards.includes(s)).map(s => `lumi:rpc:request:shard:${s}`);

    // For simplicity, broadcast to all and let workers filter
    await this.publisher!.publish("lumi:rpc:request", JSON.stringify(request));

    return new Promise((resolve, reject) => {
      const responses: RpcResponse[] = [];
      let expectedCount = targetShards === "all" ? this.shardIds.length : targetShards.length;
      
      // For "all", we expect responses from all our shards
      // In practice, we'd track which shards should respond
      
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        if (responses.length > 0) {
          resolve(responses);
        } else {
          reject(new Error("RPC call timeout - no responses"));
        }
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: (response) => {
          responses.push(response);
          if (responses.length >= expectedCount) {
            clearTimeout(timeoutHandle);
            this.pendingRequests.delete(requestId);
            resolve(responses);
          }
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(requestId);
          reject(error);
        },
        timeout: timeoutHandle,
      });
    });
  }

  async shutdown(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe("lumi:rpc:request", "lumi:rpc:response");
      await this.subscriber.quit();
    }
    if (this.publisher) {
      await this.publisher.quit();
    }
  }
}

// Built-in RPC methods for common operations
export function createStandardRpcHandlers(rpc: CrossShardRpc, client: any, services: any): void {
  // Global leaderboard
  rpc.registerHandler("global_leaderboard", async (params: { type: "leveling" | "economy"; guildId?: string; limit: number }) => {
    const { type, guildId, limit } = params;
    const key = `lumi:leaderboard:${type}:${guildId ?? "global"}`;
    const data = await services.redis.zrevrange(key, 0, limit - 1, "WITHSCORES");
    return data;
  });

  // Economy sync
  rpc.registerHandler("economy_sync", async (params: { userId: string; guildId: string }) => {
    const { userId, guildId } = params;
    const key = `lumi:economy:${guildId}:${userId}`;
    const data = await services.redis.get(key);
    return data ? JSON.parse(data) : null;
  });

  // Global ban
  rpc.registerHandler("global_ban", async (params: { userId: string; reason: string }) => {
    const { userId, reason } = params;
    const results = [];
    for (const guild of client.guilds.cache.values()) {
      try {
        await guild.members.ban(userId, { reason });
        results.push({ guildId: guild.id, success: true });
      } catch (e: any) {
        results.push({ guildId: guild.id, success: false, error: e.message });
      }
    }
    return results;
  });

  // Broadcast message
  rpc.registerHandler("broadcast", async (params: { card: any }) => {
    const { card } = params;
    const results = [];
    for (const guild of client.guilds.cache.values()) {
      const channel = guild.systemChannel || guild.channels.cache.find((c: any) => c.isTextBased?.());
      if (channel) {
        try {
          await channel.send(card);
          results.push({ guildId: guild.id, success: true });
        } catch (e: any) {
          results.push({ guildId: guild.id, success: false, error: e.message });
        }
      }
    }
    return results;
  });

  // Fetch client property
  rpc.registerHandler("fetch_client_value", async (params: { property: string }) => {
    const props = params.property.split(".");
    let value: any = client;
    for (const prop of props) {
      value = value?.[prop];
    }
    return value;
  });

  // Get shard info
  rpc.registerHandler("get_shard_info", async () => {
    return {
      workerId: process.env.WORKER_ID,
      shardIds: client.ws?.shards?.map((s: any) => s.id) || [],
      guildCount: client.guilds.cache.size,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  });
}

export function createCrossShardRpc(redis: Redis, workerId: string, shardIds: number[]): CrossShardRpc {
  return new CrossShardRpc(redis, workerId, shardIds);
}