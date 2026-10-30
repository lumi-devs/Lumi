import type { PageServerLoad, Actions } from "./$types";
import { error, fail, redirect } from "@sveltejs/kit";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireGuildAccess } from "$lib/server/auth";
import { recordAudit } from "$lib/server/audit";
import { getPrisma } from "$lib/server/prisma";
import { describeError, isPrismaCode } from "$lib/server/prismaErrors";
import {
  assertCsrf,
  DateInputSchema,
  formString,
  IdSchema,
  parseInput,
  splitList,
} from "$lib/server/validation";

const IdParam = z.coerce.number().int().positive();

const JsonField = z
  .string()
  .trim()
  .max(50_000)
  .transform((value, ctx) => {
    if (value === "") return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Expected valid JSON." });
      return z.NEVER;
    }
  });

const PermitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  nodes: z.array(z.string().min(1).max(200)).min(1).max(100),
  polarity: z.enum(["Grant", "Deny"]),
  position: z.coerce.number().int().min(0).max(100_000),
  expiresAt: DateInputSchema,
  timezone: z.string().trim().max(64).nullable(),
  whitelistScopes: z.array(z.string().min(1).max(200)).max(100),
  schedule: JsonField,
  conditions: JsonField,
});

const AssignSchema = z.object({
  targetType: z.enum(["USER", "ROLE", "CHANNEL"]),
  targetId: IdSchema,
  expiresAt: DateInputSchema,
});

async function loadPermit(guildId: string, permitId: number) {
  return getPrisma().permit.findFirst({
    where: { id: permitId, guildId },
    include: {
      assignments: { orderBy: { grantedAt: "desc" } },
    },
  });
}

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const parsedId = IdParam.safeParse(event.params.permitId);
  if (!parsedId.success) throw error(404, "Permit not found.");

  const permit = await loadPermit(guildId, parsedId.data);
  if (!permit) throw error(404, "Permit not found.");

  return {
    permit: {
      id: permit.id,
      guildId: permit.guildId,
      name: permit.name,
      number: permit.number,
      nodes: permit.nodes,
      polarity: permit.polarity,
      position: permit.position,
      builtin: permit.builtin,
      expiresAt: permit.expiresAt?.toISOString() ?? null,
      timezone: permit.timezone,
      whitelistScopes: permit.whitelistScopes,
      schedule: permit.schedule,
      conditions: permit.conditions,
      createdAt: permit.createdAt.toISOString(),
      updatedAt: permit.updatedAt.toISOString(),
      assignments: permit.assignments.map((assignment) => ({
        id: assignment.id,
        targetType: assignment.targetType,
        targetId: assignment.targetId,
        grantedBy: assignment.grantedBy,
        grantedAt: assignment.grantedAt.toISOString(),
        expiresAt: assignment.expiresAt?.toISOString() ?? null,
      })),
    },
  };
};

export const actions: Actions = {
  update: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsedId = IdParam.safeParse(event.params.permitId);
    if (!parsedId.success) return fail(404, { error: "Permit not found." });
    const permit = await loadPermit(guildId, parsedId.data);
    if (!permit) return fail(404, { error: "Permit not found." });
    if (permit.builtin) {
      return fail(403, { error: "Built-in permits cannot be edited." });
    }

    const parsed = parseInput(PermitUpdateSchema, {
      name: formString(data, "name"),
      nodes: splitList(formString(data, "nodes")),
      polarity: formString(data, "polarity", "Grant"),
      position: formString(data, "position", "0"),
      expiresAt: formString(data, "expiresAt"),
      timezone: formString(data, "timezone").trim() || null,
      whitelistScopes: splitList(formString(data, "whitelistScopes")),
      schedule: formString(data, "schedule"),
      conditions: formString(data, "conditions"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    try {
      await getPrisma().permit.update({
        where: { id: permit.id },
        data: {
          name: parsed.data.name,
          nodes: parsed.data.nodes,
          polarity: parsed.data.polarity,
          position: parsed.data.position,
          expiresAt: parsed.data.expiresAt,
          timezone: parsed.data.timezone,
          whitelistScopes: parsed.data.whitelistScopes,
          schedule:
            parsed.data.schedule === null
              ? Prisma.DbNull
              : (parsed.data.schedule as Prisma.InputJsonValue),
          conditions:
            parsed.data.conditions === null
              ? Prisma.DbNull
              : (parsed.data.conditions as Prisma.InputJsonValue),
        },
      });
    } catch (updateError) {
      if (isPrismaCode(updateError, "P2002")) {
        return fail(409, {
          error: "A permit with that name already exists.",
        });
      }
      console.error("[dashboard] permit update failed", updateError);
      return fail(500, { error: "Could not update the permit." });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.permit.update",
      targetId: String(permit.id),
      targetType: "permit",
      changes: { name: parsed.data.name },
    });
    return { success: "Permit updated." };
  },

  delete: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsedId = IdParam.safeParse(event.params.permitId);
    if (!parsedId.success) return fail(404, { error: "Permit not found." });
    const permit = await loadPermit(guildId, parsedId.data);
    if (!permit) return fail(404, { error: "Permit not found." });
    if (permit.builtin) {
      return fail(403, { error: "Built-in permits cannot be deleted." });
    }

    await getPrisma().permit.delete({ where: { id: permit.id } });
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.permit.delete",
      targetId: String(permit.id),
      targetType: "permit",
      changes: { name: permit.name, number: permit.number },
    });
    throw redirect(303, `/guilds/${guildId}/permits`);
  },

  assign: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsedId = IdParam.safeParse(event.params.permitId);
    if (!parsedId.success) return fail(404, { error: "Permit not found." });
    const permit = await loadPermit(guildId, parsedId.data);
    if (!permit) return fail(404, { error: "Permit not found." });

    const parsed = parseInput(AssignSchema, {
      targetType: formString(data, "targetType"),
      targetId: formString(data, "targetId"),
      expiresAt: formString(data, "expiresAt"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    try {
      await getPrisma().permitAssignment.create({
        data: {
          permitId: permit.id,
          guildId,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          grantedBy: userId,
          expiresAt: parsed.data.expiresAt,
        },
      });
    } catch (assignError) {
      if (isPrismaCode(assignError, "P2002")) {
        return fail(409, {
          error: "That target is already assigned to this permit.",
        });
      }
      console.error("[dashboard] permit assign failed", assignError);
      return fail(500, { error: describeError(assignError) });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.permit.assign",
      targetId: parsed.data.targetId,
      targetType: parsed.data.targetType.toLowerCase(),
      changes: { permitId: permit.id, permit: permit.name },
    });
    return { success: "Assignment created." };
  },

  unassign: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsedId = IdParam.safeParse(event.params.permitId);
    if (!parsedId.success) return fail(404, { error: "Permit not found." });
    const permit = await loadPermit(guildId, parsedId.data);
    if (!permit) return fail(404, { error: "Permit not found." });

    const assignmentId = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(formString(data, "assignmentId"));
    if (!assignmentId.success) {
      return fail(400, { error: "Invalid assignment." });
    }

    const removed = await getPrisma().permitAssignment.deleteMany({
      where: { id: assignmentId.data, permitId: permit.id, guildId },
    });
    if (removed.count === 0) {
      return fail(404, { error: "Assignment not found." });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.permit.unassign",
      targetId: String(assignmentId.data),
      targetType: "permit_assignment",
      changes: { permitId: permit.id, permit: permit.name },
    });
    return { success: "Assignment removed." };
  },
};
