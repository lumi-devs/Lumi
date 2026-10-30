import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { requireGuildAccess } from "$lib/server/auth";
import { recordAudit } from "$lib/server/audit";
import { moduleCatalog } from "$lib/server/modules";
import { getPrisma } from "$lib/server/prisma";
import { ensureGuild } from "$lib/server/settings";
import {
  assertCsrf,
  checkbox,
  formString,
  parseInput,
} from "$lib/server/validation";

const ToggleSchema = z.object({
  module: z.string().regex(/^[a-z][a-z0-9-]*$/),
});

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const [catalog, rows] = await Promise.all([
    moduleCatalog(),
    getPrisma().guildModule.findMany({ where: { guildId } }),
  ]);
  const states = new Map(rows.map((row) => [row.module, row.enabled]));
  return {
    modules: catalog.map((module) => ({
      ...module,
      enabled: states.get(module.name) ?? false,
    })),
    unknownModules: rows
      .filter((row) => !catalog.some((module) => module.name === row.module))
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

    const enabled = checkbox(data, "enabled");
    await ensureGuild(guildId);
    await getPrisma().guildModule.upsert({
      where: {
        guildId_module: { guildId, module: parsed.data.module },
      },
      update: { enabled },
      create: { guildId, module: parsed.data.module, enabled },
    });
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
    };
  },
};
