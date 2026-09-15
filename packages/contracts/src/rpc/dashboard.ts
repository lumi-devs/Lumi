import { s } from "@sapphire/shapeshift";
import type {
  AuditListData,
  ConfigHistoryListData,
  ConfigOverrideView,
  DashboardModuleView,
  GuildEntitiesData,
  GuildSettings,
  GuildShellData,
  ModuleDataListData,
} from "../views.js";
import { rpcAction, RpcTimeouts } from "./define.js";
import {
  AuditFilterShape,
  ConfigKeySchema,
  ModuleNameSchema,
  PageSchema,
  PageSizeSchema,
  SnowflakeSchema,
} from "./schemas.js";

export const ConfigOverrideModelTypes = [
  "channel",
  "role",
  "user",
  "category",
] as const;

export type ConfigOverrideModelType = (typeof ConfigOverrideModelTypes)[number];

/** Decorative only (icon/banner/member count) - not a substitute for `guild.shell.get`. */
export interface GuildSummaryView {
  guildId: string;
  icon: string | null;
  banner: string | null;
  memberCount: number | null;
}

export const dashboardRpc = {
  "guild.shell.get": rpcAction<GuildShellData>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.medium,
    summary:
      "Guild layout shell: name, icon, member count, settings, module manifests and enabled states.",
  }),
  "guild.module.get": rpcAction<{ module: DashboardModuleView | null }>()({
    input: s.object({ module: ModuleNameSchema }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.medium,
    summary:
      "One module's manifest, enabled state and config values; null when it isn't loaded.",
  }),
  "guild.entities.get": rpcAction<GuildEntitiesData>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.medium,
    summary: "Roles, channels and a member sample for pickers and id lookups.",
  }),
  "guild.summaries.list": rpcAction<{ summaries: GuildSummaryView[] }>()({
    input: s.object({
      guildIds: s.array(SnowflakeSchema).lengthGreaterThanOrEqual(1),
    }),
    auth: "session",
    timeoutMs: RpcTimeouts.short,
    summary:
      "Decorative guild rows (icon, banner, member count); omits guilds the actor can't manage.",
  }),
  "guild.module.toggle": rpcAction<{ success: boolean; enabled: boolean }>()({
    input: s.object({
      moduleName: s.string().lengthGreaterThanOrEqual(1),
      enabled: s.boolean(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Enable or disable a module for a guild.",
  }),
  "guild.config.set": rpcAction<{
    success: boolean;
    key: string;
    value: unknown;
  }>()({
    input: s.object({
      moduleName: s.string().lengthGreaterThanOrEqual(1),
      key: s.string().lengthGreaterThanOrEqual(1),
      value: s.unknown(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Write one config key (omitted value deletes it).",
  }),
  "guild.config.setMany": rpcAction<{
    success: boolean;
    /** Coerced value per key, or null when the key was deleted. */
    updated: Record<string, unknown>;
  }>()({
    input: s.object({
      moduleName: s.string().lengthGreaterThanOrEqual(1),
      values: s.unknown(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Batch config write, validated per key.",
  }),
  "guild.settings.set": rpcAction<{
    success: boolean;
    settings: GuildSettings;
  }>()({
    input: s.object({
      prefix: s.string().lengthLessThanOrEqual(5).nullable().optional(),
      locale: s.string().optional(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "General guild settings form.",
  }),
  "guild.audit.list": rpcAction<AuditListData>()({
    input: s.object(AuditFilterShape),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.medium,
    summary: "Paged guild audit log.",
  }),
  "guild.history.list": rpcAction<ConfigHistoryListData>()({
    input: s.object({
      moduleName: ModuleNameSchema.optional(),
      key: ConfigKeySchema.optional(),
      actorId: SnowflakeSchema.optional(),
      page: PageSchema,
      pageSize: PageSizeSchema,
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Paged config change history.",
  }),
  "guild.history.rollback": rpcAction<{
    success: boolean;
    moduleName: string;
    key: string;
    value: unknown;
  }>()({
    input: s.object({
      entryId: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Roll config back to a history entry.",
  }),
  "guild.overrides.list": rpcAction<{ overrides: ConfigOverrideView[] }>()({
    input: s.object({ moduleName: ModuleNameSchema.optional() }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List per-channel/role/user config overrides.",
  }),
  "guild.overrides.set": rpcAction<{ success: boolean; deleted: boolean }>()({
    input: s.object({
      moduleName: ModuleNameSchema,
      key: ConfigKeySchema,
      modelType: s.enum(ConfigOverrideModelTypes),
      modelId: SnowflakeSchema,
      value: s.unknown(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Upsert an override; null value deletes it.",
  }),
  "guild.moduleData.list": rpcAction<ModuleDataListData>()({
    input: s.object({
      moduleName: ModuleNameSchema.optional(),
      targetId: s
        .string()
        .lengthGreaterThanOrEqual(1)
        .lengthLessThanOrEqual(191)
        .optional(),
      key: ConfigKeySchema.optional(),
      page: PageSchema,
      pageSize: PageSizeSchema,
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Inspect stored module data.",
  }),
};
