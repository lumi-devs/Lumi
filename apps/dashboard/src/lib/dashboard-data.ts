import type { ConfigField } from "@lumi/contracts";

// RPC response shapes. These describe what the bot worker's RPC handlers
// return — not request payloads (those live in @lumi/contracts, shared with
// the worker). Kept dashboard-local like the old apps/dashboard/src/types.ts
// did, since only this app deserializes/renders them.

/** A guild's Guild-model settings, as returned by `guild.dashboard.get`. */
export interface GuildSettings {
  prefix: string | null;
  locale: string;
  modRoleId?: string | null;
  adminRoleId?: string | null;
  modLogChannelId?: string | null;
  muteRoleId?: string | null;
  timezone?: string;
  noMentionSpamWindowMs?: number | null;
  noMentionSpamLimit?: number | null;
  [key: string]: unknown;
}

/** One module's state + schema, as projected for the dashboard. */
export interface DashboardModuleView {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  enabled: boolean;
  configFields: ConfigField[];
  config: Record<string, unknown>;
}

/** The full payload of `guild.dashboard.get`. */
export interface DashboardData {
  name: string;
  icon: string | null;
  settings: GuildSettings;
  modules: DashboardModuleView[];
}

/** dashboard.md §9A — one row of the Global Module Kill-Switch Grid. */
export interface GlobalModuleStateView {
  moduleName: string;
  enabled: boolean;
  reason: string | null;
}

/** dashboard.md §9A `AddonGitRepoManagerTable` — one row of `downloader.repo.list`. */
export interface DownloaderRepoView {
  id: number;
  name: string;
  url: string;
  branch: string;
  commit: string | null;
}

/** The full payload of `system.dashboard.get`. */
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
  guildCount: number;
}
