export interface FleetNode {
  id: string;
  type: "manager" | "worker";
  pid: number;
  startedAt: Date;
  shards: number[];
  status: "starting" | "healthy" | "degraded" | "stopping" | "stopped";
  lastHeartbeat: Date;
  metadata: Record<string, any>;
}

export interface ShardInfo {
  id: number;
  guildCount: number;
  latency: number;
  status: "connecting" | "ready" | "disconnected" | "reconnecting";
  workerId: string;
  workerPid?: number;
}

export interface FleetConfig {
  manager: {
    port: number;
    host: string;
    totalShards: number;
    shardsPerWorker: number;
    healthCheckInterval: number;
    heartbeatTimeout: number;
  };
  worker: {
    managerUrl: string;
    workerId: string;
    shardIds: number[];
    port: number;
  };
}

export interface FleetRpcMessage {
  type: "heartbeat" | "shard_status" | "health_check" | "rebalance" | "deploy" | "shutdown" | "cross_shard_request" | "cross_shard_response";
  from: string;
  to?: string;
  payload: any;
  timestamp: Date;
}

export interface RebalancePlan {
  workerId: string;
  shardsToAdd: number[];
  shardsToRemove: number[];
  reason: string;
}

export interface DeployPlan {
  version: string;
  strategy: "rolling" | "blue-green" | "canary";
  workers: string[];
  healthCheckEndpoint: string;
}

export interface CrossShardRequest {
  id: string;
  type: "global_leaderboard" | "economy_sync" | "global_ban" | "broadcast" | "fetch_client_value";
  fromShard: number;
  targetShards: number[] | "all";
  payload: any;
  timeout: number;
}

export interface CrossShardResponse {
  requestId: string;
  fromShard: number;
  success: boolean;
  data?: any;
  error?: string;
}

export interface CrossShardResponseList {
  responses: CrossShardResponse[];
}