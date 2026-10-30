import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { requireGuildAccess } from "$lib/server/auth";
import { recordAudit } from "$lib/server/audit";
import { getPrisma } from "$lib/server/prisma";
import { isPrismaCode } from "$lib/server/prismaErrors";
import {
  assertCsrf,
  checkbox,
  formString,
  IdSchema,
  parseInput,
  splitList,
} from "$lib/server/validation";

const OptionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) =>
        value === null ||
        (Number.isInteger(value) && value >= min && value <= max),
      { message: `Expected an integer between ${min} and ${max}, or empty.` },
    );

const CommandSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500),
  triggerType: z.enum(["exact", "contains", "starts_with", "regex"]),
  trigger: z.string().trim().min(1).max(500),
  responses: z.array(z.string().min(1).max(2000)).min(1).max(50),
  enabled: z.boolean(),
  cooldownSeconds: z.coerce.number().int().min(0).max(86_400),
  permissionNodes: z.array(z.string().min(1).max(200)).max(100),
  groupId: z.string().trim().max(64).nullable(),
});

const RoleMenuGroupSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500),
  mode: z.enum(["multiple", "single"]),
  requireOne: z.boolean(),
  autoToggle: z.boolean(),
  maxSelections: OptionalInt(1, 50),
  tempDurationSeconds: OptionalInt(0, 31_536_000),
});

const RoleMenuOptionSchema = z.object({
  groupId: z.string().trim().min(1).max(64),
  roleId: IdSchema,
  label: z.string().trim().min(1).max(80),
  emoji: z.string().trim().max(32),
  description: z.string().trim().max(200),
  position: z.coerce.number().int().min(0).max(10_000),
});

const TicketCategorySchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(64),
  emoji: z.string().trim().max(32),
  description: z.string().trim().max(500),
  staffRoleIds: z.array(IdSchema).max(50),
  pingRoleIds: z.array(IdSchema).max(50),
  questions: z.array(z.string().min(1).max(500)).max(30),
  namingTemplate: z.string().trim().min(1).max(100),
  defaultPriority: z.enum(["low", "normal", "high", "urgent"]),
  position: z.coerce.number().int().min(0).max(10_000),
  enabled: z.boolean(),
});

const TicketPanelSchema = z.object({
  channelId: IdSchema,
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  categoryIds: z.array(z.string().min(1).max(64)).max(50),
});

function optionalText(data: FormData, name: string): string | null {
  const value = formString(data, name).trim();
  return value === "" ? null : value;
}

async function commandBelongsTo(guildId: string, id: string | undefined) {
  if (!id) return null;
  return getPrisma().customCommand.findFirst({ where: { id, guildId } });
}

async function menuBelongsTo(guildId: string, id: string | undefined) {
  if (!id) return null;
  return getPrisma().roleMenuGroup.findFirst({ where: { id, guildId } });
}

async function categoryBelongsTo(guildId: string, id: string | undefined) {
  if (!id) return null;
  return getPrisma().ticketCategory.findFirst({ where: { id, guildId } });
}

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const prisma = getPrisma();

  const [commands, groups, categories, panels, tickets] = await Promise.all([
    prisma.customCommand.findMany({
      where: { guildId },
      orderBy: { name: "asc" },
      include: { schedule: true },
    }),
    prisma.roleMenuGroup.findMany({
      where: { guildId },
      orderBy: { name: "asc" },
      include: { options: { orderBy: { position: "asc" } } },
    }),
    prisma.ticketCategory.findMany({
      where: { guildId },
      orderBy: { position: "asc" },
    }),
    prisma.ticketPanel.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ticket.findMany({
      where: { guildId },
      orderBy: { lastActivityAt: "desc" },
      take: 50,
      include: { category: { select: { name: true } } },
    }),
  ]);

  const groupsForCommand = await prisma.customCommandGroup.findMany({
    where: { guildId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return {
    commands: commands.map((command) => ({
      ...command,
      createdAt: command.createdAt.toISOString(),
      updatedAt: command.updatedAt.toISOString(),
      schedule: command.schedule
        ? {
            ...command.schedule,
            nextRunAt: command.schedule.nextRunAt.toISOString(),
            lastRunAt: command.schedule.lastRunAt?.toISOString() ?? null,
            createdAt: command.schedule.createdAt.toISOString(),
          }
        : null,
    })),
    commandGroups: groupsForCommand,
    menus: groups.map((group) => ({
      ...group,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    })),
    categories: categories.map((category) => ({
      ...category,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    })),
    panels: panels.map((panel) => ({
      ...panel,
      createdAt: panel.createdAt.toISOString(),
      updatedAt: panel.updatedAt.toISOString(),
    })),
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      channelId: ticket.channelId,
      userId: ticket.userId,
      status: ticket.status,
      priority: ticket.priority,
      subject: ticket.subject,
      categoryName: ticket.category?.name ?? null,
      claimedBy: ticket.claimedBy,
      lastActivityAt: ticket.lastActivityAt.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
    })),
  };
};

export const actions: Actions = {
  saveCommand: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(CommandSchema, {
      id: optionalText(data, "id") ?? undefined,
      name: formString(data, "name"),
      description: formString(data, "description"),
      triggerType: formString(data, "triggerType", "exact"),
      trigger: formString(data, "trigger"),
      responses: splitList(formString(data, "responses")),
      enabled: checkbox(data, "enabled"),
      cooldownSeconds: formString(data, "cooldownSeconds", "0"),
      permissionNodes: splitList(formString(data, "permissionNodes")),
      groupId: optionalText(data, "groupId"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    if (parsed.data.groupId) {
      const group = await getPrisma().customCommandGroup.findFirst({
        where: { id: parsed.data.groupId, guildId },
      });
      if (!group) return fail(400, { error: "Unknown command group." });
    }

    const existing = await commandBelongsTo(guildId, parsed.data.id);
    if (parsed.data.id && !existing) {
      return fail(404, { error: "Command not found." });
    }

    const payload = {
      name: parsed.data.name,
      description: parsed.data.description || null,
      triggerType: parsed.data.triggerType,
      trigger: parsed.data.trigger,
      responses: parsed.data.responses,
      enabled: parsed.data.enabled,
      cooldownSeconds: parsed.data.cooldownSeconds,
      permissionNodes: parsed.data.permissionNodes,
      groupId: parsed.data.groupId,
    };

    try {
      if (existing) {
        await getPrisma().customCommand.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await getPrisma().customCommand.create({
          data: { ...payload, guildId, createdBy: userId },
        });
      }
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return fail(409, {
          error: "A custom command with that name already exists.",
        });
      }
      console.error("[dashboard] custom command save failed", error);
      return fail(500, { error: "Could not save the custom command." });
    }

    await recordAudit({
      guildId,
      userId,
      action: existing
        ? "dashboard.feature.command.update"
        : "dashboard.feature.command.create",
      targetId: parsed.data.name,
      targetType: "custom_command",
    });
    return { success: existing ? "Command updated." : "Command created." };
  },

  deleteCommand: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const id = formString(data, "id");
    const removed = await getPrisma().customCommand.deleteMany({
      where: { id, guildId },
    });
    if (removed.count === 0) {
      return fail(404, { error: "Command not found." });
    }
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.feature.command.delete",
      targetId: id,
      targetType: "custom_command",
    });
    return { success: "Command deleted." };
  },

  saveMenu: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(RoleMenuGroupSchema, {
      id: optionalText(data, "id") ?? undefined,
      name: formString(data, "name"),
      description: formString(data, "description"),
      mode: formString(data, "mode", "multiple"),
      requireOne: checkbox(data, "requireOne"),
      autoToggle: checkbox(data, "autoToggle"),
      maxSelections: formString(data, "maxSelections"),
      tempDurationSeconds: formString(data, "tempDurationSeconds"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const existing = await menuBelongsTo(guildId, parsed.data.id);
    if (parsed.data.id && !existing) {
      return fail(404, { error: "Role menu not found." });
    }

    const payload = {
      name: parsed.data.name,
      description: parsed.data.description || null,
      mode: parsed.data.mode,
      requireOne: parsed.data.requireOne,
      autoToggle: parsed.data.autoToggle,
      maxSelections: parsed.data.maxSelections,
      tempDurationSeconds: parsed.data.tempDurationSeconds,
    };

    try {
      if (existing) {
        await getPrisma().roleMenuGroup.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await getPrisma().roleMenuGroup.create({
          data: { ...payload, guildId },
        });
      }
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return fail(409, {
          error: "A role menu with that name already exists.",
        });
      }
      console.error("[dashboard] role menu save failed", error);
      return fail(500, { error: "Could not save the role menu." });
    }

    await recordAudit({
      guildId,
      userId,
      action: existing
        ? "dashboard.feature.role_menu.update"
        : "dashboard.feature.role_menu.create",
      targetId: parsed.data.name,
      targetType: "role_menu",
    });
    return { success: existing ? "Role menu updated." : "Role menu created." };
  },

  deleteMenu: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const id = formString(data, "id");
    const removed = await getPrisma().roleMenuGroup.deleteMany({
      where: { id, guildId },
    });
    if (removed.count === 0) {
      return fail(404, { error: "Role menu not found." });
    }
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.feature.role_menu.delete",
      targetId: id,
      targetType: "role_menu",
    });
    return { success: "Role menu deleted." };
  },

  addOption: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(RoleMenuOptionSchema, {
      groupId: formString(data, "groupId"),
      roleId: formString(data, "roleId"),
      label: formString(data, "label"),
      emoji: formString(data, "emoji"),
      description: formString(data, "description"),
      position: formString(data, "position", "0"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const group = await getPrisma().roleMenuGroup.findFirst({
      where: { id: parsed.data.groupId, guildId },
    });
    if (!group) return fail(404, { error: "Role menu not found." });

    try {
      await getPrisma().roleMenuOption.create({
        data: {
          groupId: group.id,
          roleId: parsed.data.roleId,
          label: parsed.data.label,
          emoji: parsed.data.emoji || null,
          description: parsed.data.description || null,
          position: parsed.data.position,
        },
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return fail(409, {
          error: "That role is already an option in this menu.",
        });
      }
      console.error("[dashboard] role menu option failed", error);
      return fail(500, { error: "Could not add the role menu option." });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.feature.role_menu.option_add",
      targetId: parsed.data.roleId,
      targetType: "role_menu_option",
      changes: { menu: group.name },
    });
    return { success: "Role menu option added." };
  },

  deleteOption: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const optionId = formString(data, "optionId");
    const option = await getPrisma().roleMenuOption.findFirst({
      where: { id: optionId, group: { guildId } },
    });
    if (!option) return fail(404, { error: "Role menu option not found." });

    await getPrisma().roleMenuOption.delete({ where: { id: option.id } });
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.feature.role_menu.option_delete",
      targetId: option.id,
      targetType: "role_menu_option",
    });
    return { success: "Role menu option removed." };
  },

  saveCategory: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(TicketCategorySchema, {
      id: optionalText(data, "id") ?? undefined,
      name: formString(data, "name"),
      emoji: formString(data, "emoji"),
      description: formString(data, "description"),
      staffRoleIds: splitList(formString(data, "staffRoleIds")),
      pingRoleIds: splitList(formString(data, "pingRoleIds")),
      questions: splitList(formString(data, "questions")),
      namingTemplate: formString(data, "namingTemplate", "ticket-{user}"),
      defaultPriority: formString(data, "defaultPriority", "normal"),
      position: formString(data, "position", "0"),
      enabled: checkbox(data, "enabled"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const existing = await categoryBelongsTo(guildId, parsed.data.id);
    if (parsed.data.id && !existing) {
      return fail(404, { error: "Ticket category not found." });
    }

    const payload = {
      name: parsed.data.name,
      emoji: parsed.data.emoji || null,
      description: parsed.data.description || null,
      staffRoleIds: parsed.data.staffRoleIds,
      pingRoleIds: parsed.data.pingRoleIds,
      questions: parsed.data.questions,
      namingTemplate: parsed.data.namingTemplate,
      defaultPriority: parsed.data.defaultPriority,
      position: parsed.data.position,
      enabled: parsed.data.enabled,
    };

    try {
      if (existing) {
        await getPrisma().ticketCategory.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await getPrisma().ticketCategory.create({
          data: { ...payload, guildId },
        });
      }
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return fail(409, {
          error: "A ticket category with that name already exists.",
        });
      }
      console.error("[dashboard] ticket category save failed", error);
      return fail(500, { error: "Could not save the ticket category." });
    }

    await recordAudit({
      guildId,
      userId,
      action: existing
        ? "dashboard.feature.ticket_category.update"
        : "dashboard.feature.ticket_category.create",
      targetId: parsed.data.name,
      targetType: "ticket_category",
    });
    return {
      success: existing
        ? "Ticket category updated."
        : "Ticket category created.",
    };
  },

  deleteCategory: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const id = formString(data, "id");
    const removed = await getPrisma().ticketCategory.deleteMany({
      where: { id, guildId },
    });
    if (removed.count === 0) {
      return fail(404, { error: "Ticket category not found." });
    }
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.feature.ticket_category.delete",
      targetId: id,
      targetType: "ticket_category",
    });
    return { success: "Ticket category deleted." };
  },

  savePanel: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(TicketPanelSchema, {
      channelId: formString(data, "channelId"),
      title: formString(data, "title"),
      description: formString(data, "description"),
      categoryIds: splitList(formString(data, "categoryIds")),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    if (parsed.data.categoryIds.length > 0) {
      const valid = await getPrisma().ticketCategory.count({
        where: { guildId, id: { in: parsed.data.categoryIds } },
      });
      if (valid !== parsed.data.categoryIds.length) {
        return fail(400, { error: "One or more categories are invalid." });
      }
    }

    const panel = await getPrisma().ticketPanel.create({
      data: {
        guildId,
        channelId: parsed.data.channelId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        categoryIds: parsed.data.categoryIds,
      },
    });
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.feature.ticket_panel.create",
      targetId: panel.id,
      targetType: "ticket_panel",
    });
    return { success: "Ticket panel record created." };
  },

  deletePanel: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const id = formString(data, "id");
    const removed = await getPrisma().ticketPanel.deleteMany({
      where: { id, guildId },
    });
    if (removed.count === 0) {
      return fail(404, { error: "Ticket panel not found." });
    }
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.feature.ticket_panel.delete",
      targetId: id,
      targetType: "ticket_panel",
    });
    return { success: "Ticket panel deleted." };
  },
};
