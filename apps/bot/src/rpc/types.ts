// Generated type definitions matching the protobuf schema
// These match the protobuf definitions in proto/lumi/v2/*.proto

// ===== Permits =====
export interface ListPermitsRequest {
  guildId: string;
}

export interface ListPermitsResponse {
  permits: Permit[];
}

export interface CreatePermitRequest {
  guildId: string;
  name: string;
  node: string;
  polarity: Polarity;
  position: number;
  expiresAt?: string;
  schedule?: string;
  timezone?: string;
  conditions?: string;
}

export interface CreatePermitResponse {
  permit: Permit;
}

export interface UpdatePermitRequest {
  permitId: number;
  name?: string;
  node?: string;
  polarity?: Polarity;
  position?: number;
  expiresAt?: string;
  schedule?: string;
  timezone?: string;
  conditions?: string;
}

export interface UpdatePermitResponse {
  permit: Permit | null;
}

export interface DeletePermitRequest {
  permitId: number;
}

export interface DeletePermitResponse {
  success: boolean;
}

export interface MovePermitRequest {
  guildId: string;
  permitId: number;
  direction: "UP" | "DOWN";
}

export interface MovePermitResponse {
  success: boolean;
}

export interface AssignPermitRequest {
  permitId: number;
  targetType: PermitTargetType;
  targetId: string;
  grantedBy: string;
  expiresAt?: string;
}

export interface AssignPermitResponse {
  success: boolean;
}

export interface UnassignPermitRequest {
  permitId: number;
  targetType: PermitTargetType;
  targetId: string;
}

export interface UnassignPermitResponse {
  success: boolean;
}

export enum PermitTargetType {
  USER = 1,
  ROLE = 2,
  CHANNEL = 3,
}

export interface ExplainPermitRequest {
  guildId: string;
  userId: string;
  roleIds: string[];
  channelId?: string;
  guildOwnerId?: string;
  node: string;
}

export interface ExplainPermitResponse {
  rows: PermitTierExplanation[];
}

export interface PermitTierExplanation {
  tier: string;
  verdict: "ALLOW" | "DENY" | "PASS";
  detail?: string;
}

export interface GetExpiringPermitsRequest {
  guildId: string;
  before: string;
}

export interface GetExpiringPermitsResponse {
  permits: Permit[];
}

export interface Permit {
  id: number;
  name: string;
  node: string;
  polarity: Polarity;
  position: number;
  builtin: boolean;
  expiresAt: string | null;
  schedule: string | null;
  timezone: string | null;
  conditions: string | null;
}

export enum Polarity {
  GRANT = 1,
  DENY = 2,
}

// ===== Leveling =====
export interface GetLeaderboardRequest {
  guildId: string;
  page: number;
  perPage: number;
}

export interface LeaderboardResponse {
  users: LeaderboardEntry[];
  total: number;
  totalPages: number;
}

export interface LeaderboardEntry {
  userId: string;
  level: number;
  xp: string;
  rank: number;
}

export interface GetUserRankRequest {
  guildId: string;
  userId: string;
}

export interface UserRankResponse {
  level: number;
  xp: string;
  xpToNext: string;
  rank: number;
  totalUsers: number;
}

export interface GenerateRankCardRequest {
  guildId: string;
  userId: string;
}

export interface RankCardResponse {
  image: Uint8Array;
}

export interface SetXpCurveRequest {
  guildId: string;
  curve: Record<string, number>;
}

export interface SetXpCurveResponse {
  success: boolean;
}

// ===== Economy =====
export interface GetBalanceRequest {
  guildId: string;
  userId: string;
}

export interface BalanceResponse {
  balance: string;
  bankBalance: string;
  totalEarned: string;
  totalSpent: string;
}

export interface TransferRequest {
  guildId: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
}

export interface TransferResponse {
  success: boolean;
  tax?: string;
  error?: string;
}

export interface GetShopRequest {
  guildId: string;
}

export interface ShopResponse {
  items: ShopItem[];
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: string;
  type: string;
  roleId?: string;
}

export interface BuyItemRequest {
  guildId: string;
  userId: string;
  itemId: string;
}

export interface BuyItemResponse {
  success: boolean;
  error?: string;
}

export interface GenerateBalanceCardRequest {
  guildId: string;
  userId: string;
}

export interface BalanceCardResponse {
  image: Uint8Array;
}

export interface GetEconomyLeaderboardRequest {
  guildId: string;
  page: number;
  perPage: number;
}

export interface EconomyLeaderboardResponse {
  users: EconomyLeaderboardEntry[];
  total: number;
  totalPages: number;
}

export interface EconomyLeaderboardEntry {
  userId: string;
  balance: string;
  bankBalance: string;
  rank: number;
}

// ===== Fleet =====
export interface GetFleetStatusRequest {}

export interface FleetStatus {
  nodes: NodeInfo[];
  totalShards: number;
  onlineShards: number;
  status: string;
}

export interface NodeInfo {
  nodeId: string;
  shardStart: number;
  shardEnd: number;
  healthy: boolean;
  lastHeartbeat: string;
  guilds: number;
  users: number;
}

export interface GetShardAssignmentRequest {
  guildId: string;
}

export interface ShardAssignment {
  shardId: number;
  nodeId: string;
}

export interface RebalanceShardsRequest {}

export interface RebalanceShardsResponse {
  success: boolean;
  moves: ShardMove[];
}

export interface ShardMove {
  shardId: number;
  fromNode: string;
  toNode: string;
}

export interface GetNodeHealthRequest {
  nodeId: string;
}

export interface NodeHealth {
  nodeId: string;
  healthy: boolean;
  cpuUsage: number;
  memoryUsage: string;
  uptime: string;
  activeShards: number;
}

export interface TriggerRollingRestartRequest {
  batchSize: number;
  delaySeconds: number;
}

export interface RollingRestartStatus {
  started: boolean;
  totalNodes: number;
  completed: number;
}

// ===== Module =====
export interface ListModulesRequest {}

export interface ListModulesResponse {
  modules: ModuleInfo[];
}

export interface ModuleInfo {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  enabledByDefault: boolean;
}

export interface GetModuleConfigRequest {
  guildId: string;
  moduleName: string;
}

export interface GetModuleConfigResponse {
  config: string;
}

export interface SetModuleConfigRequest {
  guildId: string;
  moduleName: string;
  config: string;
}

export interface SetModuleConfigResponse {
  success: boolean;
}

export interface EnableModuleRequest {
  guildId: string;
  moduleName: string;
}

export interface EnableModuleResponse {
  success: boolean;
}

export interface DisableModuleRequest {
  guildId: string;
  moduleName: string;
}

export interface DisableModuleResponse {
  success: boolean;
}

export interface ReloadModuleRequest {
  moduleName: string;
}

export interface ReloadModuleResponse {
  success: boolean;
}