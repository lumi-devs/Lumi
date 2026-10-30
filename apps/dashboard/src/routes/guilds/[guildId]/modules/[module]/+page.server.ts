import type { PageServerLoad, Actions } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { requireGuildAccess } from "$lib/server/auth";
import { recordAudit } from "$lib/server/audit";
import { findModule } from "$lib/server/modules";
import {
  configFor,
  displayValues,
  parseConfigForm,
} from "$lib/server/moduleConfig";
import {
  deleteGuildSetting,
  readGuildSettings,
  setGuildSetting,
} from "$lib/server/settings";
import { assertCsrf } from "$lib/server/validation";

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const module = await findModule(event.params.module ?? "");
  if (!module) throw error(404, "Module not found.");

  const settings = await readGuildSettings(guildId);
  const config = configFor(settings, module.configKey);

  return {
    module,
    config: displayValues(module.configFields, config),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const module = await findModule(event.params.module ?? "");
    if (!module) return fail(404, { error: "Module not found." });

    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseConfigForm(module.configFields, data);
    if (!parsed.ok || !parsed.values) {
      return fail(400, { error: parsed.message ?? "Invalid configuration." });
    }

    await setGuildSetting(guildId, module.configKey, parsed.values);
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.module.config",
      targetId: module.name,
      targetType: "module",
      changes: { configKey: module.configKey },
    });
    return { success: `Saved ${module.displayName} configuration.` };
  },

  reset: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const module = await findModule(event.params.module ?? "");
    if (!module) return fail(404, { error: "Module not found." });

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
};
