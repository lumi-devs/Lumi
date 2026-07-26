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
} as const satisfies Record<string, RpcActionName>;
