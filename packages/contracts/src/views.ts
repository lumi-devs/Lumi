import type {
  AppealStatus,
  ReactionRoleMenuMode,
  WarnThresholdAction,
} from "./rpc.js";
import type { ConfigField } from "./config.js";
import type { MessageDocumentV2 } from "./message-blocks.js";
export type {
  LogClaimView,
  PermitKind,
  PermitTargetType,
  ReactionRoleMenuMode as ReactionRoleMenuModeView,
  ShardStateView,
  ClusterReplicaView,
  WarnThresholdAction as WarnThresholdActionView,
} from "./rpc.js";
export type { AppealStatus };

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
  category: string;
  dashboardHref: string | null;
}

export interface DashboardRoleView {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  isBotRole: boolean;
}

export interface DashboardChannelView {
  id: string;
  name: string;
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

export type {
  PermitAssignmentPayload as PermitAssignmentView,
  PermitPayload as PermitView,
} from "./rpc.js";

export interface ModerationCaseView {
  id: number;
  caseNumber: number;
  userId: string;
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

export interface WarnThresholdView {
  warnCount: number;
  action: WarnThresholdAction;
  duration: string | null;
}

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

/** Result of posting-or-editing the verification panel message. */
export interface VerificationPanelSetResult {
  success: true;
  channelId: string;
  messageId: string;
  /** A brand new message was posted (either no panel was tracked, the target
   * channel changed, or the previously tracked message could no longer be found). */
  posted: boolean;
  /** The existing tracked message was edited in place. */
  edited: boolean;
  /** The panel moved to a different channel than the one previously tracked. */
  moved: boolean;
  /** `createChannel` was requested and a new channel was created for it. */
  createdChannel: boolean;
  /** The old tracked message was deleted as part of a move. */
  oldMessageDeleted: boolean;
}

export interface LogTypeOption {
  key: string;
  label: string;
}

export interface TempVcGeneratorView {
  channelId: string;
  name: string;
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

export interface ReactionRoleOptionView {
  id: string;
  label: string;
  emoji: string | null;
  description: string | null;
  roleId: string;
  requiredRoleId: string | null;
}

export interface ReactionRoleMenuView {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  mode: ReactionRoleMenuMode;
  exclusive: boolean;
  maxRoles: number;
  channelId: string | null;
  messageIds: string[];
  options: ReactionRoleOptionView[];
  richContent: MessageDocumentV2;
  createdAt: string;
  updatedAt: string;
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

export interface AppealCaseSummary {
  caseNumber: number;
  action: string;
  reason: string | null;
  createdAt: string;
}

export type AppealVerifyResult =
  | { valid: false; reason: string }
  | {
      valid: true;
      case: AppealCaseSummary;
      existingStatus: AppealStatus | null;
    };

export interface AfkEntryView {
  userId: string;
  reason: string;
  since: string;
}

export interface IgnoredChannelView {
  id: number;
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

export interface RepoModuleView {
  name: string;
  version?: string;
  short?: string;
  description?: string;
  author?: string[];
  end_user_data_statement?: string;
  isInstalled: boolean;
  commit: string | null;
  pinned: boolean;
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

export type { SystemShardsResponse as SystemShardsData } from "./rpc.js";
