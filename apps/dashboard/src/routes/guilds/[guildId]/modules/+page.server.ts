import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { recordAudit } from "#lib/server/audit.js";
import { requireGuildForm, requireGuildId } from "#lib/server/auth.js";
import { invalidateModuleCatalog, moduleCatalog } from "#lib/server/modules.js";
import { getPrisma } from "#lib/server/prisma.js";
import { setModuleStateViaRpc } from "#lib/server/rpc.js";
import { checkbox, formString, parseInput } from "#lib/server/validation.js";
import type { Actions, PageServerLoad } from "./$types";

const ToggleSchema = z.object({
  module: z.string().regex(/^[a-z][a-z0-9-]*$/),
});

export const load: PageServerLoad = async (event) => {
  const guildId = await requireGuildId(event);
  const [catalog, rows] = await Promise.all([
    moduleCatalog(guildId),
    getPrisma().guildModule.findMany({ where: { guildId } }),
  ]);
  const modules = (catalog ?? [])
    .filter((module) => !module.isAddon)
    .map((module) => {
      const row = rows.find((r) => r.module === module.name);
      return {
        ...module,
        enabled: row !== undefined ? row.enabled : module.enabled,
      };
    });
  const known = new Set((catalog ?? []).map((module) => module.name));
  const byCategory = new Map<string, typeof modules>();
  for (const module of modules) {
    const category = module.category ?? "Other";
    const list = byCategory.get(category) ?? [];
    list.push(module);
    byCategory.set(category, list);
  }
  const groups = Array.from(byCategory, ([category, list]) => ({
    category,
    modules: list.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    enabledCount: list.filter((module) => module.enabled).length,
  })).sort((a, b) => {
    if (a.category === "Other") return 1;
    if (b.category === "Other") return -1;
    return a.category.localeCompare(b.category);
  });

  return {
    catalogAvailable: catalog !== null,
    groups,
    unknownModules: rows
      .filter((row) => !known.has(row.module))
      .map((row) => ({ name: row.module, enabled: row.enabled })),
  };
};

export const actions: Actions = {
  toggle: async (event) => {
    const { guildId, userId, data } = await requireGuildForm(event);

    const parsed = parseInput(ToggleSchema, {
      module: formString(data, "module"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const catalog = await moduleCatalog(guildId);
    if (!catalog) {
      return fail(503, {
        error: "The bot is offline; module state is unavailable.",
      });
    }
    const module = catalog.find((entry) => entry.name === parsed.data.module);
    if (!module) return fail(404, { error: "That module is not available." });

    const enabled = checkbox(data, "enabled");
    const sync = await setModuleStateViaRpc(
      guildId,
      parsed.data.module,
      enabled,
    );
    await invalidateModuleCatalog(guildId);
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
    const { guildId, userId, data } = await requireGuildForm(event);

    const parsed = parseInput(ToggleSchema, {
      module: formString(data, "module"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const catalog = await moduleCatalog(guildId);
    if (!catalog) {
      return fail(503, {
        error: "The bot is offline; module state is unavailable.",
      });
    }
    if (catalog.some((entry) => entry.name === parsed.data.module)) {
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
