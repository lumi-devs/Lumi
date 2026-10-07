import { z } from "zod";
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
  boundedArray,
  ConfigKeySchema,
  CursorSchema,
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

/**
 * Locales the dashboard may set on a guild. Contracts can't import
 * `SupportedLanguages` from `packages/core` (core depends on contracts, not
 * the reverse), so this is a second, intentionally small, hand-kept-in-sync
 * literal. `packages/core/tests/core/i18n.test.ts` asserts the two stay equal.
 */
export const SupportedLocales = ["en-US"] as const;

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
    readOnly: true,
  }),
  "guild.module.get": rpcAction<{ module: DashboardModuleView | null }>()({
    input: z.object({ module: ModuleNameSchema }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.medium,
    summary:
      "One module's manifest, enabled state and config values; null when it isn't loaded.",
    readOnly: true,
  }),
  "guild.entities.get": rpcAction<GuildEntitiesData>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.medium,
    summary: "Roles, channels and a member sample for pickers and id lookups.",
    readOnly: true,
  }),
  "guild.summaries.list": rpcAction<{ summaries: GuildSummaryView[] }>()({
    input: z.object({
      guildIds: boundedArray(SnowflakeSchema, { min: 1 }),
    }),
    auth: "session",
    timeoutMs: RpcTimeouts.short,
    summary:
      "Decorative guild rows (icon, banner, member count); omits guilds the actor can't manage.",
    readOnly: true,
  }),
  "guild.module.toggle": rpcAction<{ success: boolean; enabled: boolean }>()({
    input: z.object({
      moduleName: z.string().min(1),
      enabled: z.boolean(),
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
    input: z.object({
      moduleName: z.string().min(1),
      key: z.string().min(1),
      value: z.unknown(),
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
    input: z.object({
      moduleName: z.string().min(1),
      values: z.unknown(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Batch config write, validated per key.",
  }),
  "guild.settings.set": rpcAction<{
    success: boolean;
    settings: GuildSettings;
  }>()({
    input: z.object({
      prefix: z.string().max(5).nullable().optional(),
      locale: z.enum(SupportedLocales).optional(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "General guild settings form.",
  }),
  "guild.audit.list": rpcAction<AuditListData>()({
    input: z.object(AuditFilterShape),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.medium,
    summary: "Paged guild audit log.",
    readOnly: true,
  }),
  "guild.history.list": rpcAction<ConfigHistoryListData>()({
    input: z.object({
      moduleName: ModuleNameSchema.optional(),
      key: ConfigKeySchema.optional(),
      actorId: SnowflakeSchema.optional(),
      pageSize: PageSizeSchema,
      cursor: CursorSchema,
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Paged config change history.",
    readOnly: true,
  }),
  "guild.history.rollback": rpcAction<{
    success: boolean;
    moduleName: string;
    key: string;
    value: unknown;
  }>()({
    input: z.object({
      entryId: z.number().int().gte(1),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Roll config back to a history entry.",
  }),
  "guild.overrides.list": rpcAction<{ overrides: ConfigOverrideView[] }>()({
    input: z.object({ moduleName: ModuleNameSchema.optional() }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List per-channel/role/user config overrides.",
    readOnly: true,
  }),
  "guild.overrides.set": rpcAction<{ success: boolean; deleted: boolean }>()({
    input: z.object({
      moduleName: ModuleNameSchema,
      key: ConfigKeySchema,
      modelType: z.enum(ConfigOverrideModelTypes),
      modelId: SnowflakeSchema,
      value: z.unknown(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Upsert an override; null value deletes it.",
  }),
  "guild.moduleData.list": rpcAction<ModuleDataListData>()({
    input: z.object({
      moduleName: ModuleNameSchema.optional(),
      targetId: z.string().min(1).max(191).optional(),
      key: ConfigKeySchema.optional(),
      page: PageSchema,
      pageSize: PageSizeSchema,
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Inspect stored module data.",
    readOnly: true,
  }),
};
