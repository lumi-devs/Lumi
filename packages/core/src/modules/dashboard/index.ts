import { Module, DefineModule } from "#lib/module-system/Module.js";
import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rabbitmq/index.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import { s, type BaseValidator } from "@sapphire/shapeshift";
import { getService } from "#lib/module-system/Service.js";
import { checkModulesEnabled } from "#lib/module-check.js";
import { ChannelType } from "discord.js";

/** Channel types sensible to offer in a CHANNEL config picker by default (no threads, no categories). */
const PICKABLE_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

/** Validate the RPC request's guildId, narrowing it to a non-null snowflake. */
function requireGuildId(guildId: string | null | undefined): string {
  try {
    if (!guildId) throw new Error();
    SnowflakeSchema.parse(guildId);
    return guildId;
  } catch {
    throw new Error("guildId is required and must be a valid snowflake");
  }
}

/** Validate an RPC payload against its schema, throwing a uniform error on mismatch. */
function parsePayload<T>(schema: BaseValidator<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Bad payload: ${msg}`);
  }
}

/**
 * Re-check the actor's Discord permissions live against the guild, rather
 * than trusting the dashboard session (its cached guild list can be up to
 * `SESSION_TTL_MS` stale).
 */
async function requireGuildManager(
  guildId: string,
  actorId: string | undefined,
): Promise<void> {
  if (!actorId) throw new Error("actorId is required");
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) throw new Error("Guild not found in bot cache");
  if (guild.ownerId === actorId) return;

  const member = await guild.members.fetch(actorId).catch(() => null);
  if (
    !member?.permissions.has("ManageGuild") &&
    !member?.permissions.has("Administrator")
  ) {
    throw new Error("Missing ManageGuild permission");
  }
}

/** Stricter than `requireGuildManager` — only the guild owner may pass, no ManageGuild fallback. */
function requireGuildOwner(
  guildId: string,
  actorId: string | undefined,
): void {
  if (!actorId) throw new Error("actorId is required");
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) throw new Error("Guild not found in bot cache");
  if (guild.ownerId !== actorId) {
    throw new Error("Only the guild owner may change this setting");
  }
}

const ModuleToggleSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  enabled: s.boolean(),
});

const ConfigSetSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  key: s.string().lengthGreaterThanOrEqual(1),
  value: s.any(),
});

const GuildSettingsSchema = s.object({
  prefix: s.string().lengthLessThanOrEqual(5).nullable().optional(),
  modRoleId: SnowflakeSchema.nullable().optional(),
  adminRoleId: SnowflakeSchema.nullable().optional(),
  modLogChannelId: SnowflakeSchema.nullable().optional(),
  muteRoleId: SnowflakeSchema.nullable().optional(),
  locale: s.string().optional(),
  timezone: s.string().optional(),
  noMentionSpamWindowMs: s.number().int().nullable().optional(),
  noMentionSpamLimit: s.number().int().nullable().optional(),
  inviteUrl: s.string().url().nullable().optional(),
  supportUrl: s.string().url().nullable().optional(),
});

/** Fields in `GuildSettingsSchema` restricted to the guild owner (no ManageGuild fallback). */
const OWNER_ONLY_SETTINGS_KEYS = new Set(["inviteUrl", "supportUrl"]);

const PermitCreateSchema = s.object({
  name: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64),
  kind: s.enum(["enforced", "custom"] as const),
  nodes: s.array(s.string().lengthGreaterThanOrEqual(1)).lengthGreaterThanOrEqual(1),
});

const PermitUpdateSchema = s.object({
  permitId: s.number().int(),
  name: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64).optional(),
  nodes: s.array(s.string().lengthGreaterThanOrEqual(1)).lengthGreaterThanOrEqual(1).optional(),
});

const PermitDeleteSchema = s.object({
  permitId: s.number().int(),
});

const PermitAssignSchema = s.object({
  permitId: s.number().int(),
  targetType: s.enum(["role", "user"] as const),
  targetId: SnowflakeSchema,
});

@DefineModule({
  name: "dashboard",
  displayName: "Dashboard",
  emoji: "🖥️",
  version: "1.0.0",
  description:
    "Integrates the bot with the Lumi Web Dashboard. Provides RPC endpoints for management.",
})
export class DashboardModule extends Module {
  public override onLoad() {
    container.logger.info("[Dashboard] Initializing RPC handlers...");

    registerRpcHandler(RPC_ACTIONS.guildDashboardGet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);

      const guild = container.client.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found in bot cache");

      const settings = await container.db.config.getGuildSettings(guildId);
      const loadedModules = container.stores.get("modules").loaded();
      const moduleNames = loadedModules.map((m) => m.meta.name);

      const [enabledMap, allConfigsMap] = await Promise.all([
        checkModulesEnabled(guildId, moduleNames),
        container.db.config.getAllModuleConfigsForGuild(guildId),
      ]);

      const modules = loadedModules.map((m) => {
        const enabled = enabledMap.get(m.meta.name) ?? true;
        const guildModuleConfig = allConfigsMap.get(m.meta.name) ?? {};

        const config: Record<string, unknown> = {};
        if (m.meta.configFields) {
          for (const field of m.meta.configFields) {
            config[field.key] = guildModuleConfig[field.key] ?? field.default ?? null;
          }
        }

        return {
          name: m.meta.name,
          displayName: m.meta.displayName,
          emoji: m.meta.emoji,
          description: m.meta.description,
          enabled,
          configFields: m.meta.configFields || [],
          config,
        };
      });

      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .map((r) => ({ id: r.id, name: r.name, color: r.color }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const channels = guild.channels.cache
        .filter((c) => PICKABLE_CHANNEL_TYPES.has(c.type))
        .map((c) => ({ id: c.id, name: c.name, type: c.type }));

      const members = guild.members.cache
        .filter((m) => !m.user.bot)
        .map((m) => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, 200);

      return {
        name: guild.name,
        icon: guild.iconURL(),
        settings,
        modules,
        roles,
        channels,
        members,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildModuleToggle, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { moduleName, enabled } = parsePayload(
        ModuleToggleSchema,
        req.data,
      );

      if (moduleName === "core")
        throw new Error("Cannot disable the core module");

      await container.db.modules.setModuleGuildEnabled(
        guildId,
        moduleName,
        enabled,
      );
      return { success: true, enabled };
    });

    registerRpcHandler(RPC_ACTIONS.guildConfigSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { moduleName, key, value } = parsePayload(
        ConfigSetSchema,
        req.data,
      );

      // Same path the in-Discord config panel uses: it validates the key
      // against the module's schema, coerces/validates the value, writes
      // audit history and fires the post-set hooks. Writing straight to
      // db.config here would let a dashboard caller store arbitrary
      // unvalidated JSON under any key.
      if (value === null || value === undefined || value === "") {
        await container.db.config.deleteModuleConfigKey(
          guildId,
          moduleName,
          key,
        );
        return { success: true, key, value: null };
      }

      const raw = Array.isArray(value)
        ? value.map((entry) => String(entry)).join(",")
        : String(value);
      const { coerced } = await getService("config").setConfig(
        guildId,
        moduleName,
        key,
        raw,
        req.actorId,
      );
      return { success: true, key, value: coerced };
    });

    registerRpcHandler(RPC_ACTIONS.guildSettingsSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const data = parsePayload(GuildSettingsSchema, req.data);

      if (Object.keys(data).some((k) => OWNER_ONLY_SETTINGS_KEYS.has(k))) {
        requireGuildOwner(guildId, req.actorId);
      }

      const tx = await container.db.transaction(guildId);
      try {
        tx.write(data);
        await tx.submit();
      } finally {
        tx.dispose();
      }
      const updated = await container.db.config.getGuildSettings(guildId);
      return { success: true, settings: updated };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const permits = await getService("permissions").listPermits(guildId);
      return { permits };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsCreate, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { name, kind, nodes } = parsePayload(PermitCreateSchema, req.data);
      const permit = await getService("permissions").createPermit(
        guildId,
        name,
        kind,
        nodes,
      );
      return { success: true, permit };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsUpdate, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { permitId, name, nodes } = parsePayload(
        PermitUpdateSchema,
        req.data,
      );
      const perms = getService("permissions");
      if (name !== undefined) await perms.renamePermit(permitId, name);
      const permit = nodes !== undefined
        ? await perms.updatePermitNodes(permitId, nodes)
        : await perms.getPermit(permitId);
      return { success: true, permit };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsDelete, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { permitId } = parsePayload(PermitDeleteSchema, req.data);
      await getService("permissions").deletePermit(permitId);
      return { success: true };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsAssign, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { permitId, targetType, targetId } = parsePayload(
        PermitAssignSchema,
        req.data,
      );
      await getService("permissions").assignPermit(
        permitId,
        targetType,
        targetId,
      );
      return { success: true };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsUnassign, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { permitId, targetType, targetId } = parsePayload(
        PermitAssignSchema,
        req.data,
      );
      await getService("permissions").unassignPermit(
        permitId,
        targetType,
        targetId,
      );
      return { success: true };
    });

    return super.onLoad();
  }

  public override onUnload() {
    container.logger.info("[Dashboard] Unloading RPC handlers...");
    rpcHandlers.delete(RPC_ACTIONS.guildDashboardGet);
    rpcHandlers.delete(RPC_ACTIONS.guildModuleToggle);
    rpcHandlers.delete(RPC_ACTIONS.guildConfigSet);
    rpcHandlers.delete(RPC_ACTIONS.guildSettingsSet);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsList);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsCreate);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsUpdate);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsDelete);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsAssign);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsUnassign);
    return super.onUnload();
  }
}
