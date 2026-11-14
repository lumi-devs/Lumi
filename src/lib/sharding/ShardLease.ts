import type {RedisClient} from "@redis/Cluster.js";

const NODE_TTL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const LEASE_KEY = "lumi:cluster:shard_leases";
const NODES_KEY = "lumi:cluster:nodes";

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

let nodeId: string;
let redis: RedisClient;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isShuttingDown = false;

function generateNodeId(): string {
  return `${process.env.HOSTNAME ?? "unknown"}-${process.pid}-${Date.now()}`;
}

export async function initializeShardLease(
  client: RedisClient,
  opts: { shardCapacity?: number } = {}
): Promise<void> {
  redis = client;
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
      await redis.zadd(NODES_KEY, Date.now() + NODE_TTL_MS, nodeId);
    } catch {
      /* ignore heartbeat failures */
    }
  }, HEARTBEAT_INTERVAL_MS);

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}

async function registerNode(node: NodeRegistration): Promise<void> {
  const multi = redis.multi();
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
    const claimed = await redis.hsetnx(LEASE_KEY, String(shardId), nodeId);
    if (claimed === 1) {
      myShards.push(shardId);
    }
  }

  if (myShards.length === 0) {
    await rebalanceLeases(totalShards);
    for (let shardId = 0; shardId < totalShards; shardId++) {
      const owner = await redis.hget(LEASE_KEY, String(shardId));
      if (owner === nodeId) myShards.push(shardId);
    }
  }

  return myShards;
}

async function rebalanceLeases(totalShards: number): Promise<void> {
  const nodes = await redis.zrangebyscore(NODES_KEY, Date.now(), "+inf", "LIMIT", 0, 100);
  if (nodes.length === 0) return;

  const nodeCapacities = new Map<string, number>();
  for (const n of nodes) {
    const cap = await redis.hget(`lumi:cluster:node:${n}`, "capacity");
    const capacity = cap ? Number(cap) : totalShards;
    nodeCapacities.set(n, Number.isFinite(capacity) ? capacity : 1);
  }

  const assignments = new Map<string, number[]>();
  for (const n of nodes) {
    assignments.set(n, []);
  }

  let nodeIndex = 0;
  for (let shardId = 0; shardId < totalShards; shardId++) {
    const currentOwner = await redis.hget(LEASE_KEY, String(shardId));
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

  const multi = redis.multi();
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
    const owner = await redis.hget(LEASE_KEY, String(shardId));
    if (owner && owner === nodeId) myShards.push(shardId);
  }

  if (myShards.length > 0) {
    await handoffShards(myShards);
  }

  await redis.zrem(NODES_KEY, nodeId);
  await redis.del(`lumi:cluster:node:${nodeId}`);
  process.exit(0);
}

async function handoffShards(shards: number[]): Promise<void> {
  const nodes = await redis.zrangebyscore(NODES_KEY, Date.now(), "+inf", "LIMIT", 0, 100);
  const otherNodes = nodes.filter((n) => n !== nodeId);
  if (otherNodes.length === 0) return;

  const multi = redis.multi();
  for (let i = 0; i < shards.length; i++) {
    const targetNode = otherNodes[i % otherNodes.length];
    multi.hset(LEASE_KEY, { [String(shards[i])]: targetNode });
  }
  await multi.exec();
}