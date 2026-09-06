export interface RpcAction {
  name: string;
  payload: string;
  summary: string;
}

export interface RpcGroup {
  title: string;
  note: string;
  actions: RpcAction[];
}

const none = "none";

export const rpcGroups: RpcGroup[] = [
  {
    title: "Add-on distribution",
    note: "Module repos and installs, served by the downloader.",
    actions: [
      { name: "downloader.repo.add", payload: "RepoAddPayload { name, url, branch? }", summary: "Register a module repo." },
      { name: "downloader.repo.list", payload: none, summary: "List registered repos." },
      { name: "downloader.repo.modules", payload: "RepoModulesPayload { repoName }", summary: "List modules a repo offers." },
      { name: "downloader.module.install", payload: "ModuleInstallPayload { repoName, moduleName, revision? }", summary: "Install a module from a repo." },
      { name: "downloader.module.uninstall", payload: "ModuleUninstallPayload { moduleName }", summary: "Uninstall a module." },
      { name: "downloader.module.rollback", payload: "ModuleRollbackPayload { moduleName, revision }", summary: "Roll a module back to a revision." },
    ],
  },
  {
    title: "Guild overview and config",
    note: "What the dashboard renders first: the guild view, module toggles, and config writes.",
    actions: [
      { name: "guild.dashboard.get", payload: none, summary: "Full dashboard view for a guild." },
      { name: "guild.summaries.list", payload: "GuildSummariesPayload { guildIds }", summary: "Decorative guild rows (icon, banner, member count)." },
      { name: "guild.module.toggle", payload: "ModuleTogglePayload { moduleName, enabled }", summary: "Enable or disable a module for a guild." },
      { name: "guild.config.set", payload: "ConfigSetPayload { moduleName, key, value? }", summary: "Write one config key (omitted value deletes it)." },
      { name: "guild.config.setMany", payload: "ConfigSetManyPayload { moduleName, values }", summary: "Batch config write, validated per key." },
      { name: "guild.roles.list", payload: none, summary: "Minimal role rows for dropdowns." },
      { name: "guild.channels.list", payload: none, summary: "Minimal channel rows for dropdowns." },
      { name: "guild.setup.run", payload: none, summary: "One-shot setup wizard bootstrap." },
      { name: "guild.settings.set", payload: "GuildSettingsPayload { prefix?, muteRoleId?, locale?, timezone? }", summary: "General guild settings form." },
      { name: "guild.overrides.list", payload: "OverridesListPayload { moduleName? }", summary: "List per-channel/role/user config overrides." },
      { name: "guild.overrides.set", payload: "OverrideSetPayload { moduleName, key, modelType, modelId, value }", summary: "Upsert an override; null value deletes it." },
      { name: "guild.moduleData.list", payload: "ModuleDataListPayload { moduleName?, targetId?, key?, page?, pageSize? }", summary: "Inspect stored module data." },
    ],
  },
  {
    title: "Permits",
    note: "Role/user grants over the dot-notation permit vocabulary.",
    actions: [
      { name: "guild.permits.list", payload: none, summary: "List permits with assignments." },
      { name: "guild.permits.create", payload: "PermitCreatePayload { name, kind, nodes }", summary: "Create an enforced or custom permit." },
      { name: "guild.permits.update", payload: "PermitUpdatePayload { permitId, name?, nodes? }", summary: "Rename or re-scope a permit." },
      { name: "guild.permits.delete", payload: "PermitDeletePayload { permitId }", summary: "Delete a permit." },
      { name: "guild.permits.assign", payload: "PermitAssignPayload { permitId, targetType, targetId }", summary: "Grant a permit to a role or user." },
      { name: "guild.permits.unassign", payload: "PermitUnassignPayload { permitId, targetType, targetId }", summary: "Revoke a permit grant." },
    ],
  },
  {
    title: "Moderation",
    note: "Cases, warn thresholds, panic mode, and the blocklist.",
    actions: [
      { name: "guild.cases.list", payload: "CasesListPayload { action?, userId?, moderatorId?, page?, pageSize? }", summary: "Paged moderation cases." },
      { name: "guild.cases.revoke", payload: "CaseRevokePayload { caseNumber }", summary: "Revoke a case." },
      { name: "guild.warnThresholds.list", payload: none, summary: "List warn-count escalation rules." },
      { name: "guild.warnThresholds.set", payload: "WarnThresholdSetPayload { warnCount, action | null, duration? }", summary: "Upsert a rule; null action deletes it. mute/vcmute need a duration." },
      { name: "guild.panic.get", payload: none, summary: "Read panic-mode state." },
      { name: "guild.panic.set", payload: "PanicSetPayload { active, channelIds? }", summary: "Lock down the guild, optionally narrowed to channels." },
      { name: "guild.blocklist.list", payload: "BlocklistListPayload { page?, pageSize? }", summary: "Paged guild blocklist." },
      { name: "guild.blocklist.add", payload: "BlocklistAddPayload { userId, reason? }", summary: "Block a user." },
      { name: "guild.blocklist.remove", payload: "BlocklistRemovePayload { userId }", summary: "Unblock a user." },
      { name: "guild.modNotes.list", payload: "ModNoteListPayload { userId }", summary: "Moderator notes for a user." },
      { name: "guild.modNotes.add", payload: "ModNoteAddPayload { userId, message }", summary: "Add a moderator note." },
      { name: "guild.modNotes.remove", payload: "ModNoteRemovePayload { id }", summary: "Remove a moderator note." },
    ],
  },
  {
    title: "Safety and recovery",
    note: "Verification panels, backups, and temporary voice.",
    actions: [
      { name: "guild.verificationPanel.get", payload: none, summary: "Read the verification panel binding." },
      { name: "guild.verificationPanel.set", payload: "VerificationPanelSetPayload { channelId, messageId }", summary: "Bind the verification panel." },
      { name: "guild.verificationPanel.delete", payload: none, summary: "Remove the verification panel." },
      { name: "guild.verificationWeb.complete", payload: none, summary: "Complete a web verification flow." },
      { name: "guild.backups.list", payload: none, summary: "List guild backups (role/channel counts)." },
      { name: "guild.backups.restore", payload: "BackupRestorePayload { backupId? }", summary: "Restore a guild backup." },
      { name: "guild.tempvc.generators.list", payload: none, summary: "List temporary-voice generator channels." },
      { name: "guild.tempvc.generators.set", payload: "TempVcGeneratorSetPayload { channelId, name | null, limit? }", summary: "Upsert a generator; null name deletes it." },
      { name: "guild.tempvc.records.list", payload: none, summary: "List temporary-voice records." },
      { name: "guild.afk.list", payload: none, summary: "List AFK entries." },
      { name: "guild.ignored.list", payload: none, summary: "List ignored channels." },
      { name: "guild.ignored.add", payload: "IgnoredChannelPayload { channelId | null }", summary: "Ignore a channel; null targets the guild-wide row." },
      { name: "guild.ignored.remove", payload: "IgnoredChannelPayload { channelId | null }", summary: "Un-ignore a channel." },
    ],
  },
  {
    title: "Appeals",
    note: "Public verify/submit calls re-check the signed token server-side before writing.",
    actions: [
      { name: "guild.appeals.verify", payload: "AppealVerifyPayload { caseId, token }", summary: "Verify an appeal link token." },
      { name: "guild.appeals.submit", payload: "AppealSubmitPayload { caseId, token, message }", summary: "Submit an appeal message." },
      { name: "guild.appeals.list", payload: "AppealsListPayload { status?, page?, pageSize? }", summary: "Paged appeals for reviewers." },
      { name: "guild.appeals.review", payload: "AppealReviewPayload { id, status }", summary: "Approve, deny, blacklist-deny, or dismiss." },
    ],
  },
  {
    title: "Audit and history",
    note: "Who changed what, and a way back.",
    actions: [
      { name: "guild.audit.list", payload: "AuditListPayload { userId?, action?, platform?, page?, pageSize? }", summary: "Paged guild audit log." },
      { name: "guild.history.list", payload: "ConfigHistoryListPayload { moduleName?, key?, actorId?, page?, pageSize? }", summary: "Paged config change history." },
      { name: "guild.history.rollback", payload: "ConfigHistoryRollbackPayload { entryId }", summary: "Roll config back to a history entry." },
    ],
  },
  {
    title: "Auth, privacy, and system",
    note: "Owner detection, GDPR flows, and the bot-owner system panel.",
    actions: [
      { name: "auth.whoami", payload: none, summary: "Returns { isBotOwner }; defers to the worker PermitResolver." },
      { name: "global.gdpr.delete", payload: "GdprDeletePayload { userId, requester }", summary: "Erase a user's data." },
      { name: "global.gdpr.export", payload: "GdprExportPayload { userId }", summary: "Export a user's data, keyed by module." },
      { name: "system.dashboard.get", payload: none, summary: "System-panel overview." },
      { name: "system.maintenance.set", payload: "SystemMaintenancePayload { maintenanceMode, maintenanceMessage? }", summary: "Toggle maintenance mode." },
      { name: "system.module.toggle", payload: "SystemModuleTogglePayload { moduleName, enabled, reason? }", summary: "Globally toggle a module." },
      { name: "system.module.clear", payload: "SystemModuleClearPayload { moduleName }", summary: "Clear a module's global state." },
      { name: "system.identity.set", payload: "SystemIdentityPayload { inviteUrl?, supportGuildId? }", summary: "Set invite URL and support guild." },
      { name: "system.audit.list", payload: "SystemAuditListPayload { guildId?, ... }", summary: "Cross-guild audit log." },
      { name: "system.blocklist.list", payload: "BlocklistListPayload { page?, pageSize? }", summary: "Global blocklist." },
      { name: "system.blocklist.add", payload: "BlocklistAddPayload { userId, reason? }", summary: "Add to the global blocklist." },
      { name: "system.blocklist.remove", payload: "BlocklistRemovePayload { userId }", summary: "Remove from the global blocklist." },
      { name: "system.shards.get", payload: none, summary: "Shard telemetry: replicas, shard states, missing ids." },
    ],
  },
];

export const rpcActionCount: number = rpcGroups.reduce(
  (total, group) => total + group.actions.length,
  0,
);
