import type { ValkeyClient } from "#lib/database/cluster-safe.js";

const NODE_TTL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const LEASE_KEY = "lumi:cluster:shard_leases";
const NODES_KEY = "lumi:cluster:nodes";
const SHARD_STATE_KEY = "lumi:cluster:shard_state";

export interface ShardLease {
  shardId: number;
  nodeId: string;
  assignedAt: number;
}

export interface NodeRegistration {
  nodeId: string;
  startedAt: number;
  shardCapacity: number;
  metadata?: Record<string, unknown>;
}

export interface ShardStatePayload {
  shardId: number;
  guilds: Array<{
    id: string;
    approximateMemberCount: number;
    channels: Array<{ id: string; type: number }>;
    roles: Array<{ id: string; permissions: string }>;
  }>;
  voiceStates: Map<string, { channelId: string; deaf: boolean; mute: boolean }>;
  timestamp: number;
}

let nodeId: string;
let valkey: ValkeyClient;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isShuttingDown = false;

function generateNodeId(): string {
  return `${process.env.HOSTNAME ?? "unknown"}-${process.pid}-${Date.now()}`;
}

export async function initializeShardLease(
  client: ValkeyClient,
  opts: { shardCapacity?: number } = {}
): Promise<void> {
  valkey = client;
  nodeId = generateNodeId();

  const nodeReg: NodeRegistration = {
    nodeId,
    startedAt: Date.now(),
    shardCapacity: opts.shardCapacity ?? Number(process.env.SHARD_CAPACITY ?? "auto"),
    metadata: {
      pid: process.pid,
      hostname: process.env.HOSTNAME,
      version: process.env.npm_package_version,
    },
  };

  await registerNode(nodeReg);
  await claimShards();

  heartbeatTimer = setInterval(async () => {
    if (isShuttingDown) return;
    try {
      await valkey.zadd(NODES_KEY, Date.now() + NODE_TTL_MS, nodeId);
    } catch {
      /* ignore heartbeat failures */
    }
  }, HEARTBEAT_INTERVAL_MS);

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}

async function registerNode(node: NodeRegistration): Promise<void> {
  const multi = valkey.multi();
  multi.zadd(NODES_KEY, Date.now() + NODE_TTL_MS, node.nodeId);
  multi.hset(`lumi:cluster:node:${node.nodeId}`, {
    startedAt: String(node.startedAt),
    capacity: String(node.shardCapacity),
    metadata: JSON.stringify(node.metadata ?? {}),
  });
  await multi.exec();
}

async function claimShards(): Promise<number[]> {
  const totalShards = getClusterTotalShards();
  const myShards: number[] = [];

  for (let shardId = 0; shardId < totalShards; shardId++) {
    const claimed = await valkey.hsetnx(LEASE_KEY, String(shardId), nodeId);
    if (claimed === 1) {
      myShards.push(shardId);
    }
  }

  if (myShards.length === 0) {
    await rebalanceLeases(totalShards);
    for (let shardId = 0; shardId < totalShards; shardId++) {
      const owner = await valkey.hget(LEASE_KEY, String(shardId));
      if (owner === nodeId) myShards.push(shardId);
    }
  }

  return myShards;
}

async function rebalanceLeases(totalShards: number): Promise<void> {
  const nodes = await valkey.zrangebyscore(NODES_KEY, 0, Date.now(), "LIMIT", 0, 100);
  if (nodes.length === 0) return;

  const nodeCapacities = new Map<string, number>();
  for (const n of nodes) {
    const cap = await valkey.hget(`lumi:cluster:node:${n}`, "capacity");
    nodeCapacities.set(n, cap ? Number(cap) : totalShards);
  }

  const assignments = new Map<string, number[]>();
  for (const n of nodes) {
    assignments.set(n, []);
  }

  let nodeIndex = 0;
  for (let shardId = 0; shardId < totalShards; shardId++) {
    const currentOwner = await valkey.hget(LEASE_KEY, String(shardId));
    if (currentOwner && nodeCapacities.has(currentOwner)) {
      assignments.get(currentOwner)!.push(shardId);
      continue;
    }
    const targetNode = nodes[nodeIndex % nodes.length];
    if (targetNode) {
      assignments.get(targetNode)?.push(shardId);
      nodeIndex++;
    }
  }

  const multi = valkey.multi();
  for (const [n, shards] of assignments) {
    for (const shardId of shards) {
      multi.hset(LEASE_KEY, String(shardId), n);
    }
  }
  await multi.exec();
}

function getClusterTotalShards(): number {
  const explicit = process.env.TOTAL_SHARDS;
  if (explicit && explicit !== "auto") return Number(explicit);
  return 1;
}

export async function gracefulShutdown(): Promise<void> {
  isShuttingDown = true;
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  const myShards: number[] = [];
  for (let shardId = 0; shardId < getClusterTotalShards(); shardId++) {
    const owner = await valkey.hget(LEASE_KEY, String(shardId));
    if (owner && owner === nodeId) myShards.push(shardId);
  }

  if (myShards.length > 0) {
    await handoffShards(myShards);
  }

  await valkey.zrem(NODES_KEY, nodeId);
  await valkey.del(`lumi:cluster:node:${nodeId}`);
  process.exit(0);
}

async function handoffShards(shards: number[]): Promise<void> {
  const nodes = await valkey.zrangebyscore(NODES_KEY, 0, Date.now(), "LIMIT", 0, 100);
  const otherNodes = nodes.filter((n) => n !== nodeId);
  if (otherNodes.length === 0) return;

  const multi = valkey.multi();
  for (let i = 0; i < shards.length; i++) {
    const targetNode = otherNodes[i % otherNodes.length];
    multi.hset(LEASE_KEY, { [String(shards[i])]: targetNode });
  }
  await multi.exec();
}

export async function publishShardState(payload: ShardStatePayload): Promise<void> {
  await valkey.hset(SHARD_STATE_KEY, String(payload.shardId), JSON.stringify(payload));
}

export async function getShardState(shardId: number): Promise<ShardStatePayload | null> {
  const raw = await valkey.hget(SHARD_STATE_KEY, String(shardId));
  return raw ? JSON.parse(raw) : null;
}

export function getMyNodeId(): string {
  return nodeId;
}

export function getMyShards(): number[] {
  return [];
}