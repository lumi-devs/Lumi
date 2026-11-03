import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import { recordAudit } from "#lib/server/audit.js";
import { requireGuildId } from "#lib/server/auth.js";
import {
  type DiscordChannel,
  fetchGuildChannels,
  VoiceChannelTypes,
} from "#lib/server/discord.js";
import {
  configFor,
  displayValues,
  enabledConfigField,
  parseConfigForm,
} from "#lib/server/moduleConfig.js";
import { type CatalogModule, findModule } from "#lib/server/modules.js";
import { getPrisma } from "#lib/server/prisma.js";
import { setModuleStateViaRpc } from "#lib/server/rpc.js";
import {
  deleteGuildSetting,
  ensureGuild,
  readGuildSettings,
  setGuildSetting,
} from "#lib/server/settings.js";
import { assertCsrf, formString } from "#lib/server/validation.js";
import type { Actions, PageServerLoad } from "./$types";

const TempVcModuleName = "utility-tempvc";

const Snowflake = z.string().regex(/^\d{16,22}$/);

const TempVcGeneratorSchema = z.object({
  channelId: Snowflake,
  templateName: z.string().min(1).max(100).optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
});

const AddGeneratorSchema = z.object({
  channelId: Snowflake,
  templateName: z.string().trim().max(100).optional(),
  userLimit: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(99)])
    .optional(),
});

type TempVcGenerator = z.infer<typeof TempVcGeneratorSchema>;

function editableFields(module: CatalogModule) {
  return module.name === TempVcModuleName
    ? module.configFields.filter((field) => field.key !== "generators")
    : module.configFields;
}

function parseGenerators(value: unknown): TempVcGenerator[] {
  if (!Array.isArray(value)) return [];
  const generators: TempVcGenerator[] = [];
  for (const entry of value) {
    const parsed = TempVcGeneratorSchema.safeParse(entry);
    if (parsed.success) generators.push(parsed.data);
  }
  return generators;
}

function voiceChannels(channels: DiscordChannel[]): DiscordChannel[] {
  return channels
    .filter((channel) =>
      (VoiceChannelTypes as readonly number[]).includes(channel.type),
    )
    .sort(
      (a, b) =>
        (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
    );
}

async function readModuleConfig(
  guildId: string,
  module: CatalogModule,
): Promise<Record<string, unknown>> {
  const settings = await readGuildSettings(guildId);
  return configFor(settings, module.configKey);
}

export const load: PageServerLoad = async (event) => {
  const guildId = await requireGuildId(event);
  const module = await findModule(event.params.module ?? "");
  if (!module) throw error(404, "Module not found.");
  if (!module.isSubmodule) {
    throw error(404, "Supermodules are groups; configure a submodule instead.");
  }

  const settings = await readGuildSettings(guildId);
  const config = configFor(settings, module.configKey);
  const fields = editableFields(module);
  const isTempVc = module.name === TempVcModuleName;

  let generators: Array<TempVcGenerator & { name: string | null }> = [];
  let channels: DiscordChannel[] = [];
  if (isTempVc) {
    channels = await fetchGuildChannels(guildId)
      .then(voiceChannels)
      .catch(() => []);
    const names = new Map(
      channels.map((channel) => [channel.id, channel.name]),
    );
    generators = parseGenerators(config.generators).map((generator) => ({
      ...generator,
      name: names.get(generator.channelId) ?? null,
    }));
  }

  return {
    module: { ...module, configFields: fields },
    config: displayValues(fields, config),
    tempvc: isTempVc ? { generators, channels } : null,
  };
};

export const actions: Actions = {
  save: async (event) => {
    const guildId = await requireGuildId(event);
    const module = await findModule(event.params.module ?? "");
    if (!module) return fail(404, { error: "Module not found." });
    if (!module.isSubmodule) {
      return fail(400, {
        error: "Supermodules are groups; configure a submodule instead.",
      });
    }

    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const fields = editableFields(module);
    const parsed = parseConfigForm(fields, data);
    if (!parsed.ok || !parsed.values) {
      return fail(400, { error: parsed.message ?? "Invalid configuration." });
    }

    if (module.name === TempVcModuleName) {
      const current = await readModuleConfig(guildId, module);
      parsed.values.generators = parseGenerators(current.generators);
    }

    await setGuildSetting(guildId, module.configKey, parsed.values);
    let warning: string | undefined;
    const enabledField = enabledConfigField(fields);
    if (enabledField) {
      const enabled = parsed.values[enabledField.key] === true;
      await ensureGuild(guildId);
      await getPrisma().guildModule.upsert({
        where: { guildId_module: { guildId, module: module.name } },
        update: { enabled },
        create: { guildId, module: module.name, enabled },
      });
      const sync = await setModuleStateViaRpc(guildId, module.name, enabled);
      if (!sync.ok) {
        warning = `${sync.error ?? "The bot did not apply the change."} It will apply on the next bot restart.`;
      }
    }
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.module.config",
      targetId: module.name,
      targetType: "module",
      changes: { configKey: module.configKey },
    });
    return {
      success: `Saved ${module.displayName} configuration.`,
      ...(warning ? { warning } : {}),
    };
  },

  reset: async (event) => {
    const guildId = await requireGuildId(event);
    const module = await findModule(event.params.module ?? "");
    if (!module) return fail(404, { error: "Module not found." });
    if (!module.isSubmodule) {
      return fail(400, {
        error: "Supermodules are groups; configure a submodule instead.",
      });
    }

    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    await deleteGuildSetting(guildId, module.configKey);
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.module.config.reset",
      targetId: module.name,
      targetType: "module",
      changes: { configKey: module.configKey },
    });
    return { success: `Reset ${module.displayName} configuration.` };
  },

  addGenerator: async (event) => {
    const guildId = await requireGuildId(event);
    const module = await findModule(event.params.module ?? "");
    if (!module || module.name !== TempVcModuleName) {
      return fail(404, { error: "Module not found." });
    }

    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = AddGeneratorSchema.safeParse({
      channelId: formString(data, "channelId"),
      templateName: formString(data, "templateName").trim() || undefined,
      userLimit: formString(data, "userLimit").trim() || undefined,
    });
    if (!parsed.success) {
      return fail(400, {
        error: parsed.error.issues[0]?.message ?? "Invalid generator.",
      });
    }

    const channels = await fetchGuildChannels(guildId).catch(() => null);
    if (!channels) {
      return fail(502, { error: "Could not load the server channels." });
    }
    const channel = channels.find(
      (entry) =>
        entry.id === parsed.data.channelId &&
        (VoiceChannelTypes as readonly number[]).includes(entry.type),
    );
    if (!channel) {
      return fail(400, { error: "Choose an existing voice channel." });
    }

    const current = await readModuleConfig(guildId, module);
    const generators = parseGenerators(current.generators);
    if (generators.some((entry) => entry.channelId === channel.id)) {
      return fail(400, { error: "That channel is already a generator." });
    }
    if (generators.length >= 50) {
      return fail(400, { error: "A guild can have at most 50 generators." });
    }

    const generator: TempVcGenerator = {
      channelId: channel.id,
      ...(parsed.data.templateName
        ? { templateName: parsed.data.templateName }
        : {}),
      ...(typeof parsed.data.userLimit === "number"
        ? { userLimit: parsed.data.userLimit }
        : {}),
    };
    await setGuildSetting(guildId, module.configKey, {
      ...current,
      generators: [...generators, generator],
    });
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.module.tempvc.generator.add",
      targetId: channel.id,
      targetType: "channel",
      changes: { generator },
    });
    return { success: `Added #${channel.name} as a generator.` };
  },

  removeGenerator: async (event) => {
    const guildId = await requireGuildId(event);
    const module = await findModule(event.params.module ?? "");
    if (!module || module.name !== TempVcModuleName) {
      return fail(404, { error: "Module not found." });
    }

    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const channelId = formString(data, "channelId").trim();
    if (!Snowflake.safeParse(channelId).success) {
      return fail(400, { error: "Invalid generator channel." });
    }

    const current = await readModuleConfig(guildId, module);
    const generators = parseGenerators(current.generators);
    const next = generators.filter((entry) => entry.channelId !== channelId);
    if (next.length === generators.length) {
      return fail(404, { error: "That generator was already removed." });
    }

    await setGuildSetting(guildId, module.configKey, {
      ...current,
      generators: next,
    });
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.module.tempvc.generator.remove",
      targetId: channelId,
      targetType: "channel",
    });
    return { success: "Generator removed." };
  },
};
