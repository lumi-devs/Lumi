import { EventEmitter } from "events";
import { WebSocketServer, WebSocket } from "ws";
import type { Redis } from "ioredis";
import type {
  FleetNode,
  ShardInfo,
  FleetConfig,
  FleetRpcMessage,
  RebalancePlan,
  DeployPlan,
  CrossShardRequest,
  CrossShardResponse,
} from "./types.js";

export class FleetManager extends EventEmitter {
  private readonly config: FleetConfig["manager"];
  private readonly redis: Redis;
  private readonly wss: WebSocketServer;
  private readonly nodes: Map<string, FleetNode> = new Map();
  private readonly shardMap: Map<number, string> = new Map(); // shardId -> workerId
  private readonly pendingRequests: Map<string, { resolve: (v: CrossShardResponse) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private rebalanceInterval?: NodeJS.Timeout;

  constructor(config: FleetConfig["manager"], redis: Redis) {
    super();
    this.config = config;
    this.redis = redis;
    this.wss = new WebSocketServer({ port: config.port, host: config.host });

    this.setupWebSocketServer();
    this.startHealthChecks();
    this.startRebalanceLoop();
  }

  private setupWebSocketServer(): void {
    this.wss.on("connection", (ws: WebSocket, req) => {
      let workerId: string | null = null;

      ws.on("message", async (data: Buffer) => {
        try {
          const message: FleetRpcMessage = JSON.parse(data.toString());
          
          if (message.type === "heartbeat") {
            workerId = message.from;
            this.handleHeartbeat(workerId, message.payload);
            ws.send(JSON.stringify({ type: "heartbeat_ack", timestamp: new Date() }));
          } else if (message.type === "shard_status") {
            this.handleShardStatus(message.from, message.payload);
          } else if (message.type === "cross_shard_response") {
            this.handleCrossShardResponse(message.payload);
          }
        } catch (error) {
          console.error("[FleetManager] Failed to parse message:", error);
        }
      });

      ws.on("close", () => {
        if (workerId) {
          this.handleWorkerDisconnect(workerId);
        }
      });

      ws.on("error", (error) => {
        console.error("[FleetManager] WebSocket error:", error);
      });
    });

    console.log(`[FleetManager] WebSocket server listening on ${this.config.host}:${this.config.port}`);
  }

  private handleHeartbeat(workerId: string, payload: { shards: ShardInfo[] }): void {
    const node = this.nodes.get(workerId);
    if (node) {
      node.lastHeartbeat = new Date();
      node.status = "healthy";
      node.shards = payload.shards.map(s => s.id);
      
      // Update shard map
      for (const shard of payload.shards) {
        this.shardMap.set(shard.id, workerId);
      }
    } else {
      // New worker registration
      const newNode: FleetNode = {
        id: workerId,
        type: "worker",
        pid: payload.shards[0]?.workerPid ?? process.pid,
        startedAt: new Date(),
        shards: payload.shards.map(s => s.id),
        status: "healthy",
        lastHeartbeat: new Date(),
        metadata: {},
      };
      this.nodes.set(workerId, newNode);
      
      for (const shard of payload.shards) {
        this.shardMap.set(shard.id, workerId);
      }
      
      this.emit("worker_registered", newNode);
      console.log(`[FleetManager] Worker registered: ${workerId} with shards ${newNode.shards.join(", ")}`);
    }
  }

  private handleShardStatus(workerId: string, shard: ShardInfo): void {
    this.shardMap.set(shard.id, workerId);
    this.emit("shard_status_update", { workerId, shard });
  }

  private handleCrossShardResponse(response: CrossShardResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.requestId);
      if (response.success) {
        pending.resolve(response);
      } else {
        pending.reject(new Error(response.error || "Cross-shard request failed"));
      }
    }
  }

  private handleWorkerDisconnect(workerId: string): void {
    const node = this.nodes.get(workerId);
    if (node) {
      node.status = "stopped";
      node.shards = [];
      
      // Remove from shard map
      for (const [shardId, wid] of this.shardMap.entries()) {
        if (wid === workerId) {
          this.shardMap.delete(shardId);
        }
      }
      
      this.emit("worker_disconnected", workerId);
      console.log(`[FleetManager] Worker disconnected: ${workerId}`);
    }
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      const now = new Date();
      for (const [workerId, node] of this.nodes.entries()) {
        const timeSinceHeartbeat = now.getTime() - node.lastHeartbeat.getTime();
        if (timeSinceHeartbeat > this.config.heartbeatTimeout) {
          if (node.status !== "stopped") {
            node.status = "degraded";
            this.emit("worker_degraded", workerId, timeSinceHeartbeat);
          }
          if (timeSinceHeartbeat > this.config.heartbeatTimeout * 2) {
            this.handleWorkerDisconnect(workerId);
          }
        }
      }
    }, this.config.healthCheckInterval);
  }

  private startRebalanceLoop(): void {
    this.rebalanceInterval = setInterval(() => {
      this.checkRebalance();
    }, 60000); // Check every minute
  }

  private checkRebalance(): void {
    const workers = Array.from(this.nodes.entries()).filter(([_, n]) => n.status === "healthy");
    if (workers.length === 0) return;

    // Calculate ideal shards per worker
    const totalShards = this.config.totalShards;
    const idealPerWorker = Math.ceil(totalShards / workers.length);
    const maxPerWorker = this.config.shardsPerWorker;

    for (const [workerId, node] of workers) {
      if (node.shards.length > maxPerWorker) {
        // This worker has too many shards, need to rebalance
        const plan = this.createRebalancePlan(workerId, idealPerWorker);
        if (plan) {
          this.emit("rebalance_needed", plan);
        }
      }
    }
  }

  private createRebalancePlan(overloadedWorkerId: string, idealPerWorker: number): RebalancePlan | null {
    const overloaded = this.nodes.get(overloadedWorkerId);
    if (!overloaded || overloaded.shards.length <= idealPerWorker) return null;

    // Find underloaded workers
    const underloaded = Array.from(this.nodes.entries())
      .filter(([_, n]) => n.status === "healthy" && n.shards.length < idealPerWorker)
      .sort((a, b) => a[1].shards.length - b[1].shards.length);

    if (underloaded.length === 0) return null;

    const shardsToMove = overloaded.shards.length - idealPerWorker;
    const shardsToRemove = overloaded.shards.slice(-shardsToMove);
    
    return {
      workerId: overloadedWorkerId,
      shardsToAdd: [],
      shardsToRemove,
      reason: `Worker overloaded: ${overloaded.shards.length} shards (ideal: ${idealPerWorker})`,
    };
  }

  // Public API

  getNodes(): FleetNode[] {
    return Array.from(this.nodes.values());
  }

  getNode(workerId: string): FleetNode | undefined {
    return this.nodes.get(workerId);
  }

  getShardMap(): Map<number, string> {
    return new Map(this.shardMap);
  }

  getWorkerForShard(shardId: number): string | undefined {
    return this.shardMap.get(shardId);
  }

  async sendToWorker(workerId: string, message: FleetRpcMessage): Promise<boolean> {
    const node = this.nodes.get(workerId);
    if (!node || node.status !== "healthy") return false;

    // In a real implementation, we'd maintain WebSocket connections per worker
    // For now, we emit an event for the WebSocket handler to process
    this.emit("send_to_worker", workerId, message);
    return true;
  }

  async broadcast(message: Omit<FleetRpcMessage, "from" | "to">): Promise<number> {
    let sent = 0;
    for (const [workerId, node] of this.nodes.entries()) {
      if (node.status === "healthy") {
        await this.sendToWorker(workerId, { ...message, from: "manager", to: workerId });
        sent++;
      }
    }
    return sent;
  }

  async crossShardRequest(request: Omit<CrossShardRequest, "id">): Promise<CrossShardResponse[]> {
    const requestId = crypto.randomUUID();
    const targetShards = request.targetShards === "all" 
      ? Array.from(this.shardMap.keys()) 
      : request.targetShards;

    const fullRequest: CrossShardRequest = { ...request, id: requestId };
    const workersToAsk = new Set<string>();
    
    for (const shardId of targetShards) {
      const workerId = this.shardMap.get(shardId);
      if (workerId) workersToAsk.add(workerId);
    }

    const promises: Promise<CrossShardResponse>[] = [];
    
    for (const workerId of workersToAsk) {
      promises.push(new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error("Cross-shard request timeout"));
        }, request.timeout);

        this.pendingRequests.set(requestId, { resolve, reject, timeout });
        
        this.sendToWorker(workerId, {
          type: "cross_shard_request",
          from: "manager",
          to: workerId,
          payload: fullRequest,
          timestamp: new Date(),
        });
      }));
    }

    return Promise.allSettled(promises).then(results => 
      results
        .filter((r): r is PromiseFulfilledResult<CrossShardResponse> => r.status === "fulfilled")
        .map(r => r.value)
    );
  }

  async initiateRebalance(plan: RebalancePlan): Promise<void> {
    this.emit("rebalance_initiated", plan);
    await this.sendToWorker(plan.workerId, {
      type: "rebalance",
      from: "manager",
      to: plan.workerId,
      payload: plan,
      timestamp: new Date(),
    });
  }

  async initiateDeploy(plan: DeployPlan): Promise<void> {
    this.emit("deploy_initiated", plan);
    for (const workerId of plan.workers) {
      await this.sendToWorker(workerId, {
        type: "deploy",
        from: "manager",
        to: workerId,
        payload: plan,
        timestamp: new Date(),
      });
    }
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.rebalanceInterval) clearInterval(this.rebalanceInterval);
    
    // Notify all workers to shutdown
    await this.broadcast({
      type: "shutdown",
      payload: {},
      timestamp: new Date(),
    });

    this.wss.close();
    this.nodes.clear();
    this.shardMap.clear();
    console.log("[FleetManager] Shutdown complete");
  }
}

export function createFleetManager(config: FleetConfig["manager"], redis: Redis): FleetManager {
  return new FleetManager(config, redis);
}