import { PermissionFlagsBits } from "discord.js";

export type NukeKind =
  | "ban"
  | "kick"
  | "channel_delete"
  | "role_delete"
  | "webhook_create"
  | "vanity_change"
  | "dangerous_permission_grant"
  | "quarantine_bypass";

export type NukeResponse = "log" | "quarantine" | "ban";

export interface AntiNukeConfig {
  enabled: boolean;
  windowSeconds: number;
  limits: Record<NukeKind, number>;
  responses: Record<NukeKind, NukeResponse>;
  trustedRoleIds: string[];
}

export interface SecurityConfig {
  logChannelId: string | null;
  quarantineRoleId: string | null;
  trustedRoleIds: string[];
  minAccountAgeHours: number;
}

export const DangerousPermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
] as const;