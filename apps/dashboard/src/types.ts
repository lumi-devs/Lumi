import type { ConfigField } from "@lumi/contracts";

/** A guild's settings as returned by the `guild.dashboard.get` RPC. */
export interface GuildSettings {
  prefix: string | null;
  locale: string;
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

/** A guild entry from Discord's `/users/@me/guilds`. */
export interface OAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
  owner?: boolean;
}

/** An authenticated user's session. */
export interface Session {
  userId: string;
  username: string;
  avatar: string;
  accessToken: string;
  guilds: OAuthGuild[];
  expiresAt: number;
}
