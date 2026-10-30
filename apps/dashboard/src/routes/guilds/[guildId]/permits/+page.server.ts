import type { PageServerLoad, Actions } from "./$types";
import { redirect, fail } from "@sveltejs/kit";
import { z } from "zod";
import { requireGuildAccess } from "$lib/server/auth";
import { recordAudit } from "$lib/server/audit";
import { getPrisma } from "$lib/server/prisma";
import { isPrismaCode, describeError } from "$lib/server/prismaErrors";
import { ensureGuild } from "$lib/server/settings";
import {
  assertCsrf,
  DateInputSchema,
  formString,
  parseInput,
  splitList,
} from "$lib/server/validation";

const PermitCreateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  nodes: z.array(z.string().min(1).max(200)).min(1).max(100),
  polarity: z.enum(["Grant", "Deny"]),
  position: z.coerce.number().int().min(0).max(100_000),
  expiresAt: DateInputSchema,
  timezone: z.string().trim().max(64).nullable(),
  whitelistScopes: z.array(z.string().min(1).max(200)).max(100),
});

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const permits = await getPrisma().permit.findMany({
    where: { guildId },
    orderBy: { position: "asc" },
    include: { _count: { select: { assignments: true } } },
  });

  return {
    permits: permits.map((permit) => ({
      id: permit.id,
      name: permit.name,
      number: permit.number,
      nodes: permit.nodes,
      polarity: permit.polarity,
      position: permit.position,
      builtin: permit.builtin,
      expiresAt: permit.expiresAt?.toISOString() ?? null,
      assignments: permit._count.assignments,
    })),
  };
};

export const actions: Actions = {
  create: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(PermitCreateSchema, {
      name: formString(data, "name"),
      nodes: splitList(formString(data, "nodes")),
      polarity: formString(data, "polarity", "Grant"),
      position: formString(data, "position", "0"),
      expiresAt: formString(data, "expiresAt"),
      timezone: formString(data, "timezone").trim() || null,
      whitelistScopes: splitList(formString(data, "whitelistScopes")),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    await ensureGuild(guildId);
    const prisma = getPrisma();
    let created: { id: number; name: string; number: number } | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const max = await prisma.permit.aggregate({
        where: { guildId, builtin: false },
        _max: { number: true },
      });
      const number = (max._max.number ?? 0) + 1;
      try {
        const permit = await prisma.permit.create({
          data: {
            guildId,
            name: parsed.data.name,
            nodes: parsed.data.nodes,
            polarity: parsed.data.polarity,
            position: parsed.data.position,
            number,
            builtin: false,
            expiresAt: parsed.data.expiresAt,
            timezone: parsed.data.timezone,
            whitelistScopes: parsed.data.whitelistScopes,
          },
        });
        created = {
          id: permit.id,
          name: permit.name,
          number: permit.number,
        };
        break;
      } catch (error) {
        if (isPrismaCode(error, "P2002")) {
          const target = describeError(error);
          if (target.includes("guild_id_name") || target.includes("name")) {
            return fail(409, {
              error: "A permit with that name already exists.",
            });
          }
          continue;
        }
        console.error("[dashboard] permit create failed", error);
        return fail(500, { error: "Could not create the permit." });
      }
    }

    if (!created) {
      return fail(409, {
        error: "Could not allocate a permit number. Try again.",
      });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.permit.create",
      targetId: String(created.id),
      targetType: "permit",
      changes: { name: created.name, number: created.number },
    });
    throw redirect(303, `/guilds/${guildId}/permits/${created.id}`);
  },
};
