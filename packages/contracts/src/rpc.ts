export interface RpcRequest<T = unknown> {
  id: string;
  action: string;
  guildId?: string;
  actorId?: string;
  /** W3C `traceparent` (+ optional `tracestate`) so the handler can continue the caller's trace. */
  traceparent?: string;
  tracestate?: string;
  data?: T;
}

export interface RpcResponse<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
}

export type RpcHandler<TIn = unknown, TOut = unknown> = (
  req: RpcRequest<TIn>,
) => Promise<TOut> | TOut;

// ── Action registry ──────────────────────────────────────────────────────────
// Single source of the RPC action strings. Bot (handler side) and dashboard
// (caller side) reference these instead of re-typing the literals.

/** GDPR requester provenance (wire values of the bot's `RequesterType` enum). */
export type GdprRequester =
  "DISCORD_DELETED_USER" | "OWNER" | "USER" | "USER_STRICT";

export interface GdprDeletePayload {
  userId: string;
  requester: GdprRequester;
}

export interface GdprExportPayload {
  userId: string;
}

/** Response `data` shape of `global.gdpr.export`, keyed by module name (core data under `"core"`). */
export type GdprExportResult = Record<string, unknown>;

export interface RepoAddPayload {
  name: string;
  url: string;
  branch?: string;
}

export interface RepoModulesPayload {
  repoName: string;
}

export interface ModuleInstallPayload {
  repoName: string;
  moduleName: string;
  revision?: string;
}

export interface ModuleUninstallPayload {
  moduleName: string;
}

export interface ModuleRollbackPayload {
  moduleName: string;
  revision: string;
}

export interface ModuleTogglePayload {
  moduleName: string;
  enabled: boolean;
}

export interface ConfigSetPayload {
  moduleName: string;
  key: string;
  value?: unknown;
}

/** One created-or-reused item in a `guild.setup.run` result (a role or a channel). */
export interface GuildSetupItemResult {
  id: string;
  name: string;
  created: boolean;
}

/** Result of `guild.setup.run` — the setup wizard's one-shot guided bootstrap. */
export interface GuildSetupRunResult {
  quarantineRole: GuildSetupItemResult;
  logsChannel: GuildSetupItemResult;
  modLogsChannel: GuildSetupItemResult;
  antinukeEnabled: boolean;
  joingateEnabled: boolean;
}

/** Partial `Guild` model update from the dashboard's general-settings form. */
export interface GuildSettingsPayload {
  prefix?: string | null;
  modRoleId?: string | null;
  adminRoleId?: string | null;
  modLogChannelId?: string | null;
  muteRoleId?: string | null;
  locale?: string;
  timezone?: string;
  noMentionSpamWindowMs?: number | null;
  noMentionSpamLimit?: number | null;
}

export type PermitKind = "enforced" | "custom";
export type PermitTargetType = "role" | "user";

export interface PermitAssignmentPayload {
  id: number;
  targetType: PermitTargetType;
  targetId: string;
}

export interface PermitPayload {
  id: number;
  name: string;
  kind: PermitKind;
  nodes: string[];
  builtin: boolean;
  assignments: PermitAssignmentPayload[];
}

export interface PermitsListResponse {
  permits: PermitPayload[];
}

export interface PermitCreatePayload {
  name: string;
  kind: PermitKind;
  nodes: string[];
}

export interface PermitUpdatePayload {
  permitId: number;
  name?: string;
  nodes?: string[];
}

export interface PermitDeletePayload {
  permitId: number;
}

export interface PermitAssignPayload {
  permitId: number;
  targetType: PermitTargetType;
  targetId: string;
}

export interface PermitUnassignPayload {
  permitId: number;
  targetType: PermitTargetType;
  targetId: string;
}

export interface CasesListPayload {
  action?: string;
  userId?: string;
  moderatorId?: string;
  page?: number;
  pageSize?: number;
}

export interface CaseRevokePayload {
  caseNumber: number;
}

export const WARN_THRESHOLD_ACTIONS = [
  "mute",
  "kick",
  "ban",
  "quarantine",
  "vcmute",
] as const;

export type WarnThresholdAction = (typeof WARN_THRESHOLD_ACTIONS)[number];

/** Actions applied for a fixed window - a rule without a parseable duration is unusable. */
export const WARN_THRESHOLD_TIMED_ACTIONS = ["mute", "vcmute"] as const;

export type WarnThresholdTimedAction =
  (typeof WARN_THRESHOLD_TIMED_ACTIONS)[number];

export function isWarnThresholdAction(
  value: string,
): value is WarnThresholdAction {
  return (WARN_THRESHOLD_ACTIONS as readonly string[]).includes(value);
}

export function warnThresholdNeedsDuration(
  action: WarnThresholdAction,
): action is WarnThresholdTimedAction {
  return (WARN_THRESHOLD_TIMED_ACTIONS as readonly string[]).includes(action);
}

/** `action: null` deletes the rule for `warnCount`; any other value upserts it. */
export interface WarnThresholdSetPayload {
  warnCount: number;
  action: WarnThresholdAction | null;
  duration?: string | null;
}

/** `active: false` reverts panic mode; `channelIds` narrows which channels get locked. */
export interface PanicSetPayload {
  active: boolean;
  channelIds?: string[];
}

export interface VerificationPanelSetPayload {
  channelId: string;
  messageId: string;
}

/** `name: null` deletes the generator on `channelId`; any other value upserts it. */
export interface TempVcGeneratorSetPayload {
  channelId: string;
  name: string | null;
  limit?: number;
}

export interface AuditListPayload {
  userId?: string;
  action?: string;
  platform?: string;
  page?: number;
  pageSize?: number;
}

export interface SystemAuditListPayload extends AuditListPayload {
  guildId?: string;
}

export interface ConfigHistoryListPayload {
  moduleName?: string;
  key?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
}

export interface ConfigHistoryRollbackPayload {
  entryId: string;
}

export type ConfigOverrideModelType = "channel" | "role" | "user" | "category";

export interface OverridesListPayload {
  moduleName?: string;
}

/** `value: null` deletes the override; any other value upserts it. */
export interface OverrideSetPayload {
  moduleName: string;
  key: string;
  modelType: ConfigOverrideModelType;
  modelId: string;
  value: unknown;
}

export interface BlocklistListPayload {
  page?: number;
  pageSize?: number;
}

export interface BlocklistAddPayload {
  userId: string;
  reason?: string;
}

export interface BlocklistRemovePayload {
  userId: string;
}

export interface ModNoteListPayload {
  userId: string;
}

export interface ModNoteAddPayload {
  userId: string;
  message: string;
}

export interface ModNoteRemovePayload {
  id: number;
}

/** Reviewer-facing decisions - `pending` is the initial state, never set by a review call. */
export const APPEAL_REVIEW_STATUSES = [
  "approved",
  "denied",
  "denied_blacklisted",
  "dismissed",
] as const;

export type AppealReviewStatus = (typeof APPEAL_REVIEW_STATUSES)[number];

export const APPEAL_STATUSES = ["pending", ...APPEAL_REVIEW_STATUSES] as const;

export type AppealStatus = (typeof APPEAL_STATUSES)[number];

/** Public, unauthenticated - `token` is the signed link param, verified entirely server-side. */
export interface AppealVerifyPayload {
  caseId: number;
  token: string;
}

/** Public, unauthenticated - re-verifies `token` before writing, same as `guild.appeals.verify`. */
export interface AppealSubmitPayload {
  caseId: number;
  token: string;
  message: string;
}

export interface AppealsListPayload {
  status?: AppealStatus;
  page?: number;
  pageSize?: number;
}

export interface AppealReviewPayload {
  id: number;
  status: AppealReviewStatus;
}

/** `channelId: null` targets the guild-wide ignore row rather than one channel. */
export interface IgnoredChannelPayload {
  channelId: string | null;
}

export interface ModuleDataListPayload {
  moduleName?: string;
  targetId?: string;
  key?: string;
  page?: number;
  pageSize?: number;
}

/** Bot Owner system-panel actions. */
export interface SystemMaintenancePayload {
  maintenanceMode: boolean;
  maintenanceMessage?: string;
}

export interface SystemModuleTogglePayload {
  moduleName: string;
  enabled: boolean;
  reason?: string;
}

export interface SystemModuleClearPayload {
  moduleName: string;
}

export interface SystemIdentityPayload {
  inviteUrl?: string | null;
  supportGuildId?: string | null;
}

/** One reporting shard, as published by the process holding its WebSocket. */
export interface ShardStateView {
  shardId: number;
  replicaId: string;
  /** discord.js `Status` name, e.g. `Ready`, `Connecting`, `Reconnecting`. */
  status: string;
  /** Gateway heartbeat round-trip in ms; null until the first heartbeat lands. */
  ping: number | null;
  guildCount: number;
  lastHeartbeatAt: string;
}

/** One gateway process in the cluster. */
export interface ClusterReplicaView {
  replicaId: string;
  reportingShardIds: number[];
}

/** Response of `system.shards.get`. */
export interface SystemShardsResponse {
  clusterName: string;
  shardCount: number;
  observedAt: string;
  replicas: ClusterReplicaView[];
  shards: ShardStateView[];
  /** Expected shard ids no process is reporting. */
  missingShardIds: number[];
}

/** Maps each RPC action to the `data` payload the caller must send. */
export interface RpcRequestPayloads {
  "global.gdpr.delete": GdprDeletePayload;
  "downloader.repo.add": RepoAddPayload;
  "downloader.repo.list": never;
  "downloader.repo.modules": RepoModulesPayload;
  "downloader.module.install": ModuleInstallPayload;
  "downloader.module.uninstall": ModuleUninstallPayload;
  "downloader.module.rollback": ModuleRollbackPayload;
  "guild.dashboard.get": never;
  "guild.module.toggle": ModuleTogglePayload;
  "guild.config.set": ConfigSetPayload;
  "guild.setup.run": never;
  "guild.settings.set": GuildSettingsPayload;
  "guild.permits.list": never;
  "guild.permits.create": PermitCreatePayload;
  "guild.permits.update": PermitUpdatePayload;
  "guild.permits.delete": PermitDeletePayload;
  "guild.permits.assign": PermitAssignPayload;
  "guild.permits.unassign": PermitUnassignPayload;
  "guild.cases.list": CasesListPayload;
  "guild.cases.revoke": CaseRevokePayload;
  "guild.warnThresholds.list": never;
  "guild.warnThresholds.set": WarnThresholdSetPayload;
  "guild.panic.get": never;
  "guild.panic.set": PanicSetPayload;
  "guild.verificationPanel.get": never;
  "guild.verificationPanel.set": VerificationPanelSetPayload;
  "guild.verificationPanel.delete": never;
  "guild.verificationWeb.complete": never;
  "guild.tempvc.generators.list": never;
  "guild.tempvc.generators.set": TempVcGeneratorSetPayload;
  "guild.tempvc.records.list": never;
  "guild.audit.list": AuditListPayload;
  "guild.history.list": ConfigHistoryListPayload;
  "guild.history.rollback": ConfigHistoryRollbackPayload;
  "guild.overrides.list": OverridesListPayload;
  "guild.overrides.set": OverrideSetPayload;
  "guild.blocklist.list": BlocklistListPayload;
  "guild.blocklist.add": BlocklistAddPayload;
  "guild.blocklist.remove": BlocklistRemovePayload;
  "guild.modNotes.list": ModNoteListPayload;
  "guild.modNotes.add": ModNoteAddPayload;
  "guild.modNotes.remove": ModNoteRemovePayload;
  "guild.appeals.verify": AppealVerifyPayload;
  "guild.appeals.submit": AppealSubmitPayload;
  "guild.appeals.list": AppealsListPayload;
  "guild.appeals.review": AppealReviewPayload;
  "guild.afk.list": never;
  "guild.ignored.list": never;
  "guild.ignored.add": IgnoredChannelPayload;
  "guild.ignored.remove": IgnoredChannelPayload;
  "guild.moduleData.list": ModuleDataListPayload;
  "auth.whoami": never;
  "global.gdpr.export": GdprExportPayload;
  "system.dashboard.get": never;
  "system.maintenance.set": SystemMaintenancePayload;
  "system.module.toggle": SystemModuleTogglePayload;
  "system.module.clear": SystemModuleClearPayload;
  "system.identity.set": SystemIdentityPayload;
  "system.audit.list": SystemAuditListPayload;
  "system.blocklist.list": BlocklistListPayload;
  "system.blocklist.add": BlocklistAddPayload;
  "system.blocklist.remove": BlocklistRemovePayload;
  "system.shards.get": never;
}

/** Response of `auth.whoami` — lets the dashboard defer owner detection to
 *  the worker's `PermitResolver.isBotOwner`, which recognizes the Discord
 *  application's actual owner without any env-var configuration. */
export interface WhoAmIResponse {
  isBotOwner: boolean;
}

export type RpcActionName = keyof RpcRequestPayloads;

export const RPC_ACTIONS = {
  gdprDelete: "global.gdpr.delete",
  repoAdd: "downloader.repo.add",
  repoList: "downloader.repo.list",
  repoModules: "downloader.repo.modules",
  moduleInstall: "downloader.module.install",
  moduleUninstall: "downloader.module.uninstall",
  moduleRollback: "downloader.module.rollback",
  guildDashboardGet: "guild.dashboard.get",
  guildModuleToggle: "guild.module.toggle",
  guildConfigSet: "guild.config.set",
  guildSetupRun: "guild.setup.run",
  guildSettingsSet: "guild.settings.set",
  guildPermitsList: "guild.permits.list",
  guildPermitsCreate: "guild.permits.create",
  guildPermitsUpdate: "guild.permits.update",
  guildPermitsDelete: "guild.permits.delete",
  guildPermitsAssign: "guild.permits.assign",
  guildPermitsUnassign: "guild.permits.unassign",
  guildCasesList: "guild.cases.list",
  guildCasesRevoke: "guild.cases.revoke",
  guildWarnThresholdsList: "guild.warnThresholds.list",
  guildWarnThresholdsSet: "guild.warnThresholds.set",
  guildPanicGet: "guild.panic.get",
  guildPanicSet: "guild.panic.set",
  guildVerificationPanelGet: "guild.verificationPanel.get",
  guildVerificationPanelSet: "guild.verificationPanel.set",
  guildVerificationPanelDelete: "guild.verificationPanel.delete",
  guildVerificationWebComplete: "guild.verificationWeb.complete",
  guildTempVcGeneratorsList: "guild.tempvc.generators.list",
  guildTempVcGeneratorSet: "guild.tempvc.generators.set",
  guildTempVcRecordsList: "guild.tempvc.records.list",
  guildAuditList: "guild.audit.list",
  guildHistoryList: "guild.history.list",
  guildHistoryRollback: "guild.history.rollback",
  guildOverridesList: "guild.overrides.list",
  guildOverridesSet: "guild.overrides.set",
  guildBlocklistList: "guild.blocklist.list",
  guildBlocklistAdd: "guild.blocklist.add",
  guildBlocklistRemove: "guild.blocklist.remove",
  guildModNotesList: "guild.modNotes.list",
  guildModNotesAdd: "guild.modNotes.add",
  guildModNotesRemove: "guild.modNotes.remove",
  guildAppealsVerify: "guild.appeals.verify",
  guildAppealsSubmit: "guild.appeals.submit",
  guildAppealsList: "guild.appeals.list",
  guildAppealsReview: "guild.appeals.review",
  guildAfkList: "guild.afk.list",
  guildIgnoredList: "guild.ignored.list",
  guildIgnoredAdd: "guild.ignored.add",
  guildIgnoredRemove: "guild.ignored.remove",
  guildModuleDataList: "guild.moduleData.list",
  authWhoAmI: "auth.whoami",
  gdprExport: "global.gdpr.export",
  systemDashboardGet: "system.dashboard.get",
  systemMaintenanceSet: "system.maintenance.set",
  systemModuleToggle: "system.module.toggle",
  systemModuleClear: "system.module.clear",
  systemIdentitySet: "system.identity.set",
  systemAuditList: "system.audit.list",
  systemBlocklistList: "system.blocklist.list",
  systemBlocklistAdd: "system.blocklist.add",
  systemBlocklistRemove: "system.blocklist.remove",
  systemShardsGet: "system.shards.get",
} as const satisfies Record<string, RpcActionName>;
