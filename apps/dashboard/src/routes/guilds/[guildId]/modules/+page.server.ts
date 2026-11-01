import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { recordAudit } from "$lib/server/audit";
import { requireGuildAccess } from "$lib/server/auth";
import {
  configFor,
  effectiveModuleEnabled,
  enabledConfigField,
} from "$lib/server/moduleConfig";
import { moduleCatalog } from "$lib/server/modules";
import { getPrisma } from "$lib/server/prisma";
import { setModuleStateViaRpc } from "$lib/server/rpc";
import {
  ensureGuild,
  readGuildSettings,
  setGuildSetting,
} from "$lib/server/settings";
import {
  assertCsrf,
  checkbox,
  formString,
  parseInput,
} from "$lib/server/validation";
import type { Actions, PageServerLoad } from "./$types";

const ToggleSchema = z.object({
  module: z.string().regex(/^[a-z][a-z0-9-]*$/),
});

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const [catalog, rows, settings] = await Promise.all([
    moduleCatalog(),
    getPrisma().guildModule.findMany({ where: { guildId } }),
    readGuildSettings(guildId),
  ]);
  const states = new Map(rows.map((row) => [row.module, row.enabled]));
  const modules = catalog.map((module) => ({
    ...module,
    enabled: effectiveModuleEnabled(
      module.configFields,
      configFor(settings, module.configKey),
      states.get(module.name) ?? true,
    ),
  }));
  const known = new Set(modules.map((module) => module.name));
  const groups = modules
    .filter((module) => !module.isSubmodule)
    .map((parent) => {
      const submodules = modules.filter(
        (module) => module.isSubmodule && module.supermodule === parent.name,
      );
      return {
        ...parent,
        submodules,
        enabledCount: submodules.filter((module) => module.enabled).length,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const orphanSubmodules = modules.filter(
    (module) =>
      module.isSubmodule &&
      (module.supermodule === null || !known.has(module.supermodule)),
  );

  return {
    groups,
    orphanSubmodules,
    unknownModules: rows
      .filter((row) => !known.has(row.module))
      .map((row) => ({ name: row.module, enabled: row.enabled })),
  };
};

export const actions: Actions = {
  toggle: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(ToggleSchema, {
      module: formString(data, "module"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const module = await moduleCatalog().then((catalog) =>
      catalog.find((entry) => entry.name === parsed.data.module),
    );
    if (!module) return fail(404, { error: "That module is not available." });
    if (!module.isSubmodule) {
      return fail(400, {
        error:
          "Supermodules are groups; enable or disable a submodule instead.",
      });
    }

    const enabled = checkbox(data, "enabled");
    await ensureGuild(guildId);
    const field = enabledConfigField(module.configFields);
    if (field) {
      const settings = await readGuildSettings(guildId);
      const config = configFor(settings, module.configKey);
      await setGuildSetting(guildId, module.configKey, {
        ...config,
        [field.key]: enabled,
      });
    }
    await getPrisma().guildModule.upsert({
      where: {
        guildId_module: { guildId, module: parsed.data.module },
      },
      update: { enabled },
      create: { guildId, module: parsed.data.module, enabled },
    });
    const sync = await setModuleStateViaRpc(
      guildId,
      parsed.data.module,
      enabled,
    );
    await recordAudit({
      guildId,
      userId,
      action: enabled ? "dashboard.module.enable" : "dashboard.module.disable",
      targetId: parsed.data.module,
      targetType: "module",
      changes: { enabled },
    });
    return {
      success: `${module.displayName} ${enabled ? "enabled" : "disabled"}.`,
      ...(sync.ok
        ? {}
        : {
            warning: `${sync.error ?? "The bot did not apply the change."} It will apply on the next bot restart.`,
          }),
    };
  },

  removeUnknown: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(ToggleSchema, {
      module: formString(data, "module"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const known = await moduleCatalog().then((catalog) =>
      catalog.some((entry) => entry.name === parsed.data.module),
    );
    if (known) {
      return fail(400, {
        error: "That module still exists; disable it instead of removing it.",
      });
    }

    const deleted = await getPrisma().guildModule.deleteMany({
      where: { guildId, module: parsed.data.module },
    });
    if (deleted.count === 0) {
      return fail(404, { error: "That stale entry was already removed." });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.module.remove_stale",
      targetId: parsed.data.module,
      targetType: "module",
    });
    return { success: `Removed stale module entry ${parsed.data.module}.` };
  },
};
