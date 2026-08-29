import type { AppealStatus, ConfigField } from "@lumi/contracts";

export interface GuildSettings {
  prefix: string | null;
  locale: string;
  muteRoleId?: string | null;
  timezone?: string;
  [key: string]: unknown;
}

export interface DashboardModuleView {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  short?: string;
  endUserDataStatement?: string;
  version: string;
  conflicts: string[];
  dependencies: string[];
  enabled: boolean;
  configFields: ConfigField[];
  config: Record<string, unknown>;
  isAddon: boolean;
  /** Sidebar/grid grouping declared by the module's own manifest. */
  category: string;
  /** Bespoke dashboard route (relative to `/guild/:id/`), when the module has one instead of the generic config form. */
  dashboardHref: string | null;
}

export interface DashboardRoleView {
  id: string;
  name: string;
  color: number;
  position: number;
  /** Native Discord permission bitfield, as a decimal string. */
  permissions: string;
  isBotRole: boolean;
}

export interface DashboardChannelView {
  id: string;
  name: string;
  /** Raw discord.js `ChannelType` number. */
  type: number;
}

export interface DashboardMemberView {
  id: string;
  username: string;
  displayName: string;
}

export interface DashboardData {
  name: string;
  icon: string | null;
  banner: string | null;
  memberCount: number;
  settings: GuildSettings;
  modules: DashboardModuleView[];
  roles: DashboardRoleView[];
  channels: DashboardChannelView[];
  members: DashboardMemberView[];
}

export type PermitKind = "enforced" | "custom";
export type PermitTargetType = "role" | "user";

export interface PermitAssignmentView {
  id: number;
  targetType: PermitTargetType;
  targetId: string;
}

export interface PermitView {
  id: number;
  name: string;
  kind: PermitKind;
  nodes: string[];
  builtin: boolean;
  assignments: PermitAssignmentView[];
}

export interface ModerationCaseView {
  id: number;
  caseNumber: number;
  /** `"0"` once anonymized by a GDPR erasure. */
  userId: string;
  /** `"0"` once anonymized by a GDPR erasure. */
  moderatorId: string;
  action: string;
  reason: string | null;
  duration: number | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface CasesListData {
  cases: ModerationCaseView[];
  total: number;
  page: number;
  pageSize: number;
}

export type WarnThresholdActionView =
  "mute" | "kick" | "ban" | "quarantine" | "vcmute";

export interface WarnThresholdView {
  warnCount: number;
  action: WarnThresholdActionView;
  duration: string | null;
}

/** `active: false` leaves every other field empty. */
export interface PanicStateView {
  active: boolean;
  actorId: string | null;
  invitesPaused: boolean;
  lockedChannelIds: string[];
  startedAt: string | null;
}

export interface VerificationPanelView {
  channelId: string;
  messageId: string;
  createdAt: string;
}

export interface TempVcGeneratorView {
  channelId: string;
  /** Name template; `{}` is the number slot. */
  name: string;
  /** User limit on spawned channels; 0 is unlimited. */
  limit: number;
}

export interface TempVcRecordView {
  channelId: string;
  ownerId: string;
  generatorId: string;
  name: string;
  number: number;
  locked: boolean;
  hidden: boolean;
  createdAt: string;
}

export interface AuditEntryView {
  id: number;
  guildId: string;
  userId: string;
  action: string;
  platform: string;
  details: unknown;
  createdAt: string;
}

export interface AuditListData {
  entries: AuditEntryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConfigHistoryEntryView {
  id: string;
  moduleName: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string;
  createdAt: string;
}

export interface ConfigHistoryListData {
  entries: ConfigHistoryEntryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConfigOverrideView {
  id: string;
  moduleName: string;
  key: string;
  modelType: string;
  modelId: string;
  value: unknown;
}

export interface BlocklistEntryView {
  id: number;
  userId: string;
  reason: string | null;
  blockedBy: string;
  createdAt: string;
}

export interface BlocklistListData {
  entries: BlocklistEntryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ModNoteView {
  id: number;
  userId: string;
  authorId: string;
  message: string;
  createdAt: string;
}

export interface AppealView {
  id: number;
  userId: string;
  caseId: number;
  caseNumber: number;
  action: string;
  status: AppealStatus;
  message: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AppealsListData {
  appeals: AppealView[];
  total: number;
  page: number;
  pageSize: number;
}

/** Summary of the case a public appeal link points at - just enough to render the intake form. */
export interface AppealCaseSummary {
  caseNumber: number;
  action: string;
  reason: string | null;
  createdAt: string;
}

/** Result of verifying a public appeal link's token server-side. `valid: false`
 *  covers a bad/expired/mismatched token or a non-appealable case - `reason`
 *  is safe to show the visitor. */
export type AppealVerifyResult =
  | { valid: false; reason: string }
  | {
      valid: true;
      case: AppealCaseSummary;
      /** Set when this case already has an appeal - the intake page shows its status instead of a submit form. */
      existingStatus: AppealStatus | null;
    };

export interface AfkEntryView {
  userId: string;
  reason: string;
  since: string;
}

export interface IgnoredChannelView {
  id: number;
  /** `null` ignores the whole guild, not one channel. */
  channelId: string | null;
  createdAt: string;
}

export interface ModuleDataEntryView {
  moduleName: string;
  targetId: string;
  key: string;
  value: unknown;
}

export interface ModuleDataListData {
  entries: ModuleDataEntryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GlobalModuleStateView {
  moduleName: string;
  enabled: boolean;
  reason: string | null;
}

export interface DownloaderRepoView {
  id: number;
  name: string;
  url: string;
  branch: string;
  commit: string | null;
}

export interface SystemDashboardData {
  global: {
    botName: string;
    defaultPrefix: string;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
    inviteUrl: string | null;
    supportGuildId: string | null;
  };
  moduleStates: GlobalModuleStateView[];
  allModules: { name: string; displayName: string; emoji: string }[];
  guildCount: number;
}

export interface ShardStateView {
  shardId: number;
  replicaId: string;
  status: string;
  ping: number | null;
  guildCount: number;
  lastHeartbeatAt: string;
}

export interface ClusterReplicaView {
  replicaId: string;
  reportingShardIds: number[];
}

export interface SystemShardsData {
  clusterName: string;
  shardCount: number;
  observedAt: string;
  replicas: ClusterReplicaView[];
  shards: ShardStateView[];
  missingShardIds: number[];
}
