// Dashboard RPC bridge wire types and action definitions.


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
}

export interface ModuleUninstallPayload {
  moduleName: string;
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

/** dashboard.md §9B `GuildGeneralSettingsCard` — partial `Guild` model update. */
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

/** dashboard.md §10 — Bot Owner System Panel actions. */
export interface SystemMaintenancePayload {
  maintenanceMode: boolean;
  maintenanceMessage?: string;
}

export interface SystemModuleTogglePayload {
  moduleName: string;
  enabled: boolean;
  reason?: string;
}

/** Maps each RPC action to the `data` payload the caller must send. */
export interface RpcRequestPayloads {
  "global.gdpr.delete": GdprDeletePayload;
  "downloader.repo.add": RepoAddPayload;
  "downloader.repo.list": never;
  "downloader.repo.modules": RepoModulesPayload;
  "downloader.module.install": ModuleInstallPayload;
  "downloader.module.uninstall": ModuleUninstallPayload;
  "guild.dashboard.get": never;
  "guild.module.toggle": ModuleTogglePayload;
  "guild.config.set": ConfigSetPayload;
  "guild.settings.set": GuildSettingsPayload;
  "auth.whoami": never;
  "system.dashboard.get": never;
  "system.maintenance.set": SystemMaintenancePayload;
  "system.module.toggle": SystemModuleTogglePayload;
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
  guildDashboardGet: "guild.dashboard.get",
  guildModuleToggle: "guild.module.toggle",
  guildConfigSet: "guild.config.set",
  guildSettingsSet: "guild.settings.set",
  authWhoAmI: "auth.whoami",
  // System Panel (dashboard.md §10) — request/response contracts only; the
  // bot worker doesn't implement handlers for these yet (see apps/worker),
  // same as the rest of §10's action list. Adding the remaining ones
  // (warn thresholds, permits, panic, tempvc, overrides, history, audit)
  // is left for whoever builds out the matching stub pages in
  // apps/dashboard/src/app/guild/[guildId]/*.
  systemDashboardGet: "system.dashboard.get",
  systemMaintenanceSet: "system.maintenance.set",
  systemModuleToggle: "system.module.toggle",
} as const satisfies Record<string, RpcActionName>;
