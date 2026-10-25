import { EventEmitter } from "events";
import WebSocket from "ws";
import type { Client, ShardClientUtil } from "discord.js";
import type { Redis } from "ioredis";
import type {
  FleetNode,
  ShardInfo,
  FleetConfig,
  CrossShardRequest,
  CrossShardResponse,
} from "./types.js";
import {
  FleetEventType,
  encodeMessage,
  decodeMessage,
  type IdentifyData,
  type StartShardsData,
  type StopShardData,
  type DeployData,
  type CrossShardRequestData,
  type CrossShardResponseData,
  type ShardStatus,
} from "./protocol.js";

export class FleetWorker extends EventEmitter {
  private readonly config: FleetConfig["worker"];
  private readonly redis: Redis;
  private readonly client: Client;
  private readonly ws: WebSocket;
  private readonly pendingRequests: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private statusInterval?: NodeJS.Timeout;
  private readonly workerId: string;
  private readonly shardIds: number[];
  private status: "connecting" | "ready" | "reconnecting" | "stopping" = "connecting";

  constructor(config: FleetConfig["worker"], redis: Redis, client: Client) {
    super();
    this.config = config;
    this.redis = redis;
    this.client = client;
    this.workerId = config.workerId;
    this.shardIds = config.shardIds;

    this.ws = new WebSocket(`ws://${config.managerUrl}`);
    this.setupWebSocket();
    this.setupShardEvents();
  }

  private setupWebSocket(): void {
    this.ws.on("open", () => {
      console.log(`[FleetWorker:${this.workerId}] Connected to manager`);
      this.sendIdentify();
      this.startHeartbeat();
      this.startStatusReporting();
    });

    this.ws.on("message", (data: Buffer) => {
      const message = decodeMessage(data);
      if (!message) return;
      this.handleMessage(message);
    });

    this.ws.on("close", () => {
      console.log(`[FleetWorker:${this.workerId}] Disconnected from manager`);
      this.status = "reconnecting";
      this.stopIntervals();
      // Attempt reconnection after 5 seconds
      setTimeout(() => this.reconnect(), 5000);
    });

    this.ws.on("error", (error) => {
      console.error(`[FleetWorker:${this.workerId}] WebSocket error:`, error);
    });
  }

  private reconnect(): void {
    console.log(`[FleetWorker:${this.workerId}] Reconnecting...`);
    // WebSocket will auto-reconnect or we create new connection
    // For simplicity, emit event for external handling
    this.emit("reconnect_needed");
  }

  private sendIdentify(): void {
    const identifyData: IdentifyData = {
      totalShards: this.client.shard?.count ?? this.shardIds.length,
      runningShards: this.shardIds,
      version: process.env.npm_package_version ?? "2.0.0",
      nodeId: this.workerId,
      orchestratorLogicVersion: 1,
    };
    this.ws.send(encodeMessage(FleetEventType.EvtIdentify, identifyData));
  }

  private handleMessage(message: { eventType: FleetEventType; data: any }): void {
    switch (message.eventType) {
      case FleetEventType.EvtIdentified:
        this.handleIdentified(message.data);
        break;
      case FleetEventType.EvtHeartbeatAck:
        // Heartbeat acknowledged
        break;
      case FleetEventType.EvtStartShards:
        this.handleStartShards(message.data);
        break;
      case FleetEventType.EvtStopShard:
        this.handleStopShard(message.data);
        break;
      case FleetEventType.EvtPrepareShardMigration:
        this.handlePrepareMigration(message.data);
        break;
      case FleetEventType.EvtStartShardMigration:
        this.handleStartMigration(message.data);
        break;
      case FleetEventType.EvtDeploy:
        this.handleDeploy(message.data);
        break;
      case FleetEventType.EvtCrossShardRequest:
        this.handleCrossShardRequest(message.data);
        break;
      case FleetEventType.EvtShutdown:
        this.handleShutdown();
        break;
    }
  }

  private handleIdentified(data: { totalShards: number; nodeId: string }): void {
    console.log(`[FleetWorker:${this.workerId}] Identified with manager, total shards: ${data.totalShards}`);
    this.status = "ready";
    this.emit("ready");
  }

  private handleStartShards(data: StartShardsData): void {
    console.log(`[FleetWorker:${this.workerId}] Starting shards: ${data.shardIds.join(", ")}`);
    for (const shardId of data.shardIds) {
      if (!this.shardIds.includes(shardId)) {
        this.shardIds.push(shardId);
      }
      this.client.shard?.broadcastEval((c: any, { shardId }: { shardId: number }) => {
        if (c.ws.shards.has(shardId)) {
          c.ws.shards.get(shardId)?.connect();
        }
      }, { context: { shardId } });
    }
    // Acknowledge
    this.ws.send(encodeMessage(FleetEventType.EvtStartShards, { shardIds: data.shardIds }));
  }

  private handleStopShard(data: StopShardData): void {
    console.log(`[FleetWorker:${this.workerId}] Stopping shard: ${data.shardId}`);
    this.client.shard?.broadcastEval((c: any, { shardId }: { shardId: number }) => {
      const shard = c.ws.shards.get(shardId);
      if (shard) {
        shard.disconnect();
      }
    }, { context: { shardId: data.shardId } });
    this.shardIds.splice(this.shardIds.indexOf(data.shardId), 1);
    this.ws.send(encodeMessage(FleetEventType.EvtStopShard, { shardId: data.shardId }));
  }

  private async handlePrepareMigration(data: { origin: boolean; shardId: number; sessionId?: string; sequence?: number }): Promise<void> {
    if (data.origin) {
      // We're the origin - close the shard and send session info
      let sessionId: string | undefined;
      let sequence: number | undefined;
      
      await this.client.shard?.broadcastEval(async (c: any, { shardId }: { shardId: number }) => {
        const shard = c.ws.shards.get(shardId);
        if (shard) {
          sessionId = (shard as any).sessionId;
          sequence = (shard as any).sequence;
          await shard.disconnect();
        }
      }, { context: { shardId: data.shardId } });
      
      this.ws.send(encodeMessage(FleetEventType.EvtPrepareShardMigration, {
        origin: false,
        shardId: data.shardId,
        sessionId,
        sequence,
      }));
    } else {
      // We're the destination - prepare to receive
      this.ws.send(encodeMessage(FleetEventType.EvtPrepareShardMigration, {
        origin: false,
        shardId: data.shardId,
      }));
    }
  }

  private handleStartMigration(data: StartShardsData): void {
    // Start the shard with the session info we received
    // The session info would be stored from PrepareShardMigration
    console.log(`[FleetWorker:${this.workerId}] Starting migration for shard: ${data.shardIds.join(", ")}`);
  }

  private async handleDeploy(data: DeployData): Promise<void> {
    console.log(`[FleetWorker:${this.workerId}] Deploy requested: ${data.version}`);
    
    try {
      // In a real implementation, this would:
      // 1. Pull new version (git pull, docker pull, etc.)
      // 2. Install dependencies
      // 3. Run migrations
      // 4. Restart gracefully
      
      if (data.strategy === "rolling") {
        // Rolling restart - restart shards one by one
        for (const shardId of this.shardIds) {
          await this.client.shard?.broadcastEval(async (c: any, { shardId }: { shardId: number }) => {
            const shard = c.ws.shards.get(shardId);
            if (shard) {
              await shard.disconnect();
              await new Promise(r => setTimeout(r, 2000));
              shard.connect();
            }
          }, { context: { shardId } });
        }
      }
      
      this.ws.send(encodeMessage(FleetEventType.EvtDeployComplete, {
        success: true,
        version: data.version,
      }));
    } catch (error: any) {
      this.ws.send(encodeMessage(FleetEventType.EvtDeployComplete, {
        success: false,
        version: data.version,
        error: error.message,
      }));
    }
  }

  private async handleCrossShardRequest(data: CrossShardRequestData): Promise<void> {
    try {
      let result: any;
      
      switch (data.type) {
        case "global_leaderboard":
          result = await this.handleGlobalLeaderboard(data.payload);
          break;
        case "economy_sync":
          result = await this.handleEconomySync(data.payload);
          break;
        case "global_ban":
          result = await this.handleGlobalBan(data.payload);
          break;
        case "broadcast":
          result = await this.handleBroadcast(data.payload);
          break;
        case "fetch_client_value":
          result = await this.handleFetchClientValue(data.payload);
          break;
        default:
          throw new Error(`Unknown cross-shard request type: ${data.type}`);
      }

      const response: CrossShardResponseData = {
        requestId: data.requestId,
        fromShard: this.shardIds[0], // Any shard we own
        success: true,
        data: result,
      };
      this.ws.send(encodeMessage(FleetEventType.EvtCrossShardResponse, response));
    } catch (error: any) {
      const response: CrossShardResponseData = {
        requestId: data.requestId,
        fromShard: this.shardIds[0],
        success: false,
        error: error.message,
      };
      this.ws.send(encodeMessage(FleetEventType.EvtCrossShardResponse, response));
    }
  }

  private async handleGlobalLeaderboard(payload: { type: "leveling" | "economy"; guildId?: string; limit: number }): Promise<any> {
    // Use Redis to aggregate leaderboard across shards
    const key = `lumi:leaderboard:${payload.type}:${payload.guildId ?? "global"}`;
    const data = await this.redis.zrevrange(key, 0, payload.limit - 1, "WITHSCORES");
    return data;
  }

  private async handleEconomySync(payload: { userId: string; guildId: string }): Promise<any> {
    // Sync economy data across shards
    const key = `lumi:economy:${payload.guildId}:${payload.userId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  private async handleGlobalBan(payload: { userId: string; reason: string }): Promise<any> {
    // Ban user across all guilds this worker manages
    const results = [];
    for (const guild of this.client.guilds.cache.values()) {
      try {
        await guild.members.ban(payload.userId, { reason: payload.reason });
        results.push({ guildId: guild.id, success: true });
      } catch (e: any) {
        results.push({ guildId: guild.id, success: false, error: e.message });
      }
    }
    return results;
  }

  private async handleBroadcast(payload: { card: any }): Promise<any> {
    // Broadcast message to all guilds
    const results = [];
    for (const guild of this.client.guilds.cache.values()) {
      const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased()) as any;
      if (channel) {
        try {
          await channel.send(payload.card);
          results.push({ guildId: guild.id, success: true });
        } catch (e: any) {
          results.push({ guildId: guild.id, success: false, error: e.message });
        }
      }
    }
    return results;
  }

  private async handleFetchClientValue(payload: { property: string }): Promise<any> {
    // Fetch a client property value (e.g., guilds.cache.size)
    const props = payload.property.split(".");
    let value: any = this.client;
    for (const prop of props) {
      value = value?.[prop];
    }
    return value;
  }

  private handleShutdown(): void {
    console.log(`[FleetWorker:${this.workerId}] Shutdown requested`);
    this.status = "stopping";
    this.stopIntervals();
    this.ws.close();
    this.emit("shutdown");
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(encodeMessage(FleetEventType.EvtHeartbeat, { timestamp: Date.now() }));
      }
    }, 10000);
  }

  private startStatusReporting(): void {
    this.statusInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        const shardStatuses: ShardStatus[] = [];
        for (const shardId of this.shardIds) {
          const shard = this.client.ws?.shards.get(shardId);
          shardStatuses.push({
            id: shardId,
            guildCount: this.client.guilds.cache.filter(g => g.shardId === shardId).size,
            latency: shard?.ping ?? -1,
            status: shard?.status === 0 ? "ready" : shard?.status === 1 ? "connecting" : "disconnected",
          });
        }
        
        this.ws.send(encodeMessage(FleetEventType.EvtShardStatus, { shards: shardStatuses }));
      }
    }, 30000);
  }

  private stopIntervals(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.statusInterval) clearInterval(this.statusInterval);
  }

  private setupShardEvents(): void {
    this.client.on("shardReady", (shardId) => {
      console.log(`[FleetWorker:${this.workerId}] Shard ${shardId} ready`);
      this.emit("shard_ready", shardId);
    });

    this.client.on("shardDisconnect", (event, shardId) => {
      console.log(`[FleetWorker:${this.workerId}] Shard ${shardId} disconnected: ${event.code}`);
      this.emit("shard_disconnect", shardId, event);
    });

    this.client.on("shardError", (error, shardId) => {
      console.error(`[FleetWorker:${this.workerId}] Shard ${shardId} error:`, error);
      this.emit("shard_error", shardId, error);
    });
  }

  // Public API

  getWorkerId(): string {
    return this.workerId;
  }

  getShardIds(): number[] {
    return [...this.shardIds];
  }

  getStatus(): string {
    return this.status;
  }

  // Cross-shard RPC client methods
  async crossShardRequest(request: Omit<CrossShardRequest, "fromShard" | "id">): Promise<CrossShardResponse[]> {
    const requestId = crypto.randomUUID();
    const fullRequest: CrossShardRequestData = {
      ...request,
      requestId,
      fromShard: this.shardIds[0],
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Cross-shard request timeout"));
      }, request.timeout);

      const responses: CrossShardResponse[] = [];
      const expectedCount = request.targetShards === "all" ? this.shardIds.length : request.targetShards.length;
      
      this.pendingRequests.set(requestId, { 
        resolve: (response) => {
          responses.push(response);
          if (responses.length >= expectedCount) {
            resolve(responses);
          }
        }, 
        reject, 
        timeout 
      });
      
      this.ws.send(encodeMessage(FleetEventType.EvtCrossShardRequest, fullRequest));
    });
  }

  async fetchClientValue(property: string, targetShards: number[] | "all" = "all"): Promise<any[]> {
    const responses = await this.crossShardRequest({
      type: "fetch_client_value",
      targetShards,
      payload: { property },
      timeout: 10000,
    });
    return responses.map(r => r.data).filter(Boolean);
  }

  async globalLeaderboard(type: "leveling" | "economy", limit: number = 100): Promise<any> {
    const responses = await this.crossShardRequest({
      type: "global_leaderboard",
      targetShards: "all",
      payload: { type, limit },
      timeout: 10000,
    });
    // Aggregate leaderboard results
    const allData: any[] = [];
    for (const r of responses) {
      if (r.data) allData.push(...r.data);
    }
    return allData.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async broadcast(card: any): Promise<any> {
    const responses = await this.crossShardRequest({
      type: "broadcast",
      targetShards: "all",
      payload: { card },
      timeout: 30000,
    });
    return responses.map(r => r.data).filter(Boolean);
  }

  async shutdown(): Promise<void> {
    this.handleShutdown();
  }
}

export function createFleetWorker(config: FleetConfig["worker"], redis: Redis, client: Client): FleetWorker {
  return new FleetWorker(config, redis, client);
}