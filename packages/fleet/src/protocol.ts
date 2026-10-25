/**
 * Fleet Protocol - Message types for Manager <-> Worker communication
 * Based on YAGPDB's dshardorchestrator protocol
 */

export enum FleetEventType {
  // <10: Misc control codes
  
  // EvtIdentify - Worker identifies to Manager
  // Manager <- Worker: Identify the new connection
  EvtIdentify = 1,

  // EvtIdentified - Response to EvtIdentify
  // Manager -> Worker: Connection established
  EvtIdentified = 2,

  // EvtHeartbeat - Regular heartbeat
  // Bidirectional
  EvtHeartbeat = 3,

  // EvtHeartbeatAck - Response to heartbeat
  // Manager -> Worker
  EvtHeartbeatAck = 4,

  // EvtShutdown - Shut down worker completely
  // Manager -> Worker
  EvtShutdown = 5,

  // 1x: Shard control codes

  // EvtStartShards - Assign shards to worker
  // Manager -> Worker: Assign shards, respond when registered
  // Manager <- Worker: Sent as response when registered
  EvtStartShards = 10,

  // EvtStopShard - Stop a shard
  // Manager -> Worker: Stop shard, respond when done
  // Manager <- Worker: Sent when shard stopped
  EvtStopShard = 11,

  // EvtShardStatus - Shard status update
  // Worker -> Manager: Periodic status updates
  EvtShardStatus = 12,

  // 2x: Migration codes

  // EvtPrepareShardMigration - Prepare for shard migration
  // Manager -> Origin: Close gateway, respond with session info
  // Manager <- Origin: Session closed, includes sessionID/sequence for resume
  // Manager -> Dest: Save session info, prepare for transfer, respond when ready
  // Manager <- Dest: Ready for data transfer
  EvtPrepareShardMigration = 20,

  // EvtStartShardMigration - Start transferring shard data
  // Manager -> Origin: Start sending all state data
  EvtStartShardMigration = 21,

  // EvtAllStateDataSent - All state data sent
  // Worker -> Manager: Sent at end of state transfer, includes count
  EvtAllStateDataSent = 22,

  // 3x: Deploy/Rollout codes

  // EvtDeploy - Deploy new version
  // Manager -> Worker: Deploy new version
  EvtDeploy = 30,

  // EvtDeployComplete - Deploy completed
  // Worker -> Manager: Deploy finished
  EvtDeployComplete = 31,

  // 4x: Cross-shard RPC

  // EvtCrossShardRequest - Cross-shard RPC request
  // Manager -> Worker: Forward cross-shard request
  EvtCrossShardRequest = 40,

  // EvtCrossShardResponse - Cross-shard RPC response
  // Worker -> Manager: Response to cross-shard request
  EvtCrossShardResponse = 41,

  // 5x: Health/Metrics

  // EvtMetrics - Metrics report
  // Worker -> Manager: Periodic metrics
  EvtMetrics = 50,
}

// Data structures for each event

export interface IdentifyData {
  totalShards: number;
  runningShards: number[];
  version: string;
  nodeId: string;
  orchestratorLogicVersion: number;
}

export interface IdentifiedData {
  totalShards: number;
  nodeId: string;
}

export interface HeartbeatData {
  shards: ShardStatus[];
  timestamp: number;
}

export interface HeartbeatAckData {
  timestamp: number;
}

export interface StartShardsData {
  shardIds: number[];
}

export interface StopShardData {
  shardId: number;
}

export interface ShardStatus {
  id: number;
  guildCount: number;
  latency: number;
  status: "connecting" | "ready" | "disconnected" | "reconnecting";
}

export interface ShardStatusData {
  shards: ShardStatus[];
}

export interface PrepareShardMigrationData {
  origin: boolean;
  shardId: number;
  sessionId?: string;
  sequence?: number;
  resumeGatewayUrl?: string;
}

export interface StartShardMigrationData {
  shardId: number;
}

export interface AllStateDataSentData {
  numEvents: number;
}

export interface DeployData {
  version: string;
  strategy: "rolling" | "blue-green" | "canary";
  healthCheckEndpoint: string;
}

export interface DeployCompleteData {
  success: boolean;
  version: string;
  error?: string;
}

export interface CrossShardRequestData {
  requestId: string;
  type: "global_leaderboard" | "economy_sync" | "global_ban" | "broadcast" | "fetch_client_value";
  fromShard: number;
  targetShards: number[] | "all";
  payload: any;
  timeout: number;
}

export interface CrossShardResponseData {
  requestId: string;
  fromShard: number;
  success: boolean;
  data?: any;
  error?: string;
}

export interface MetricsData {
  shardId: number;
  cpuUsage: number;
  memoryUsage: number;
  guildCount: number;
  eventLoopLag: number;
  timestamp: number;
}

// Event data map for encoding/decoding
export const EventDataMap: Record<FleetEventType, any> = {
  [FleetEventType.EvtIdentify]: {} as IdentifyData,
  [FleetEventType.EvtIdentified]: {} as IdentifiedData,
  [FleetEventType.EvtHeartbeat]: {} as HeartbeatData,
  [FleetEventType.EvtHeartbeatAck]: {} as HeartbeatAckData,
  [FleetEventType.EvtShutdown]: null,
  [FleetEventType.EvtStartShards]: {} as StartShardsData,
  [FleetEventType.EvtStopShard]: {} as StopShardData,
  [FleetEventType.EvtShardStatus]: {} as ShardStatusData,
  [FleetEventType.EvtPrepareShardMigration]: {} as PrepareShardMigrationData,
  [FleetEventType.EvtStartShardMigration]: {} as StartShardMigrationData,
  [FleetEventType.EvtAllStateDataSent]: {} as AllStateDataSentData,
  [FleetEventType.EvtDeploy]: {} as DeployData,
  [FleetEventType.EvtDeployComplete]: {} as DeployCompleteData,
  [FleetEventType.EvtCrossShardRequest]: {} as CrossShardRequestData,
  [FleetEventType.EvtCrossShardResponse]: {} as CrossShardResponseData,
  [FleetEventType.EvtMetrics]: {} as MetricsData,
};

export interface FleetMessage {
  eventType: FleetEventType;
  data: any;
}

// Wire format: 4 bytes event type (uint32 LE) + 4 bytes length (uint32 LE) + data
export function encodeMessage(eventType: FleetEventType, data: any): Buffer {
  if (data === null || data === undefined) {
    return encodeMessageRaw(eventType, Buffer.alloc(0));
  }

  const serialized = JSON.stringify(data);
  return encodeMessageRaw(eventType, Buffer.from(serialized, "utf-8"));
}

export function encodeMessageRaw(eventType: FleetEventType, data: Buffer): Buffer {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt32LE(eventType, 0);
  buf.writeUInt32LE(data.length, 4);
  data.copy(buf, 8);
  return buf;
}

export function decodeMessage(buffer: Buffer): FleetMessage | null {
  if (buffer.length < 8) return null;

  const eventType = buffer.readUInt32LE(0);
  const length = buffer.readUInt32LE(4);

  if (buffer.length < 8 + length) return null;

  const dataBuffer = buffer.subarray(8, 8 + length);
  
  let data: any = null;
  if (length > 0) {
    try {
      data = JSON.parse(dataBuffer.toString("utf-8"));
    } catch {
      data = dataBuffer;
    }
  }

  return { eventType, data };
}

// Event name lookup
export function eventTypeToString(eventType: FleetEventType): string {
  const names: Record<FleetEventType, string> = {
    [FleetEventType.EvtIdentify]: "Identify",
    [FleetEventType.EvtIdentified]: "Identified",
    [FleetEventType.EvtHeartbeat]: "Heartbeat",
    [FleetEventType.EvtHeartbeatAck]: "HeartbeatAck",
    [FleetEventType.EvtShutdown]: "Shutdown",
    [FleetEventType.EvtStartShards]: "StartShards",
    [FleetEventType.EvtStopShard]: "StopShard",
    [FleetEventType.EvtShardStatus]: "ShardStatus",
    [FleetEventType.EvtPrepareShardMigration]: "PrepareShardMigration",
    [FleetEventType.EvtStartShardMigration]: "StartShardMigration",
    [FleetEventType.EvtAllStateDataSent]: "AllStateDataSent",
    [FleetEventType.EvtDeploy]: "Deploy",
    [FleetEventType.EvtDeployComplete]: "DeployComplete",
    [FleetEventType.EvtCrossShardRequest]: "CrossShardRequest",
    [FleetEventType.EvtCrossShardResponse]: "CrossShardResponse",
    [FleetEventType.EvtMetrics]: "Metrics",
  };
  return names[eventType] ?? `Unknown(${eventType})`;
}