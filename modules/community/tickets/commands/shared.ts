import { requireGuildId } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, type makeInfoCard } from "@lumi/ui";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  accessContextFromInteraction,
  isTicketAdmin,
  isTicketStaff,
  ticketAccess,
} from "../access.js";
import {
  getTicketsConfig,
  isTicketsModuleEnabled,
  type TicketsConfig,
} from "../config.js";
import { TicketsModuleName } from "../constants.js";
import {
  findTicketByChannel,
  questionsOf,
  type TicketCategoryRecord,
  type TicketRecord,
} from "../repository.js";

export const CategoryNameLimit = 80;

export async function replyCard(
  interaction: ChatInputCommandInteraction,
  card: ReturnType<typeof makeInfoCard>,
): Promise<void> {
  const payload =
    interaction.deferred || interaction.replied ? card : ephemeralCard(card);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => undefined);
  } else {
    await interaction.reply(payload).catch(() => undefined);
  }
}

export async function replyError(
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
): Promise<void> {
  await replyCard(interaction, makeErrorCard(title, body));
}

export async function guildIdOf(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) {
    await replyError(
      interaction,
      "Server Only",
      "Ticket commands can only be used inside a server.",
    );
    return null;
  }
  return guildId;
}

export async function ensureModule(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<boolean> {
  if (isTicketsModuleEnabled(services, guildId)) return true;
  await replyError(
    interaction,
    "Tickets Disabled",
    `The ${TicketsModuleName} module is disabled on this server.`,
  );
  return false;
}

export async function requireAdmin(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<boolean> {
  const context = accessContextFromInteraction(interaction);
  if (!context || !(await isTicketAdmin(services, context))) {
    await replyError(
      interaction,
      "Staff Only",
      "You need the **tickets.admin** permit, **Manage Server**, or **Administrator** to configure tickets.",
    );
    return false;
  }
  return true;
}

export async function requireStaff(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  config: TicketsConfig,
): Promise<boolean> {
  const context = accessContextFromInteraction(interaction);
  if (!context || !(await isTicketStaff(services, context, config))) {
    await replyError(
      interaction,
      "Staff Only",
      "You need a ticket staff role or the **tickets.manage** permit to do that.",
    );
    return false;
  }
  return true;
}

export async function currentTicket(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<TicketRecord | null> {
  const ticket = await findTicketByChannel(services, interaction.channelId);
  if (!ticket) {
    await replyError(
      interaction,
      "Not A Ticket",
      "Run this command inside a ticket thread.",
    );
    return null;
  }
  return ticket;
}

export interface TicketCommandContext {
  ticket: TicketRecord;
  config: TicketsConfig;
  access: { isStaff: boolean; isAdmin: boolean };
}

export async function requireTicketAccess(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  options: { staffOnly?: boolean; openOnly?: boolean } = {},
): Promise<TicketCommandContext | null> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) {
    await replyError(
      interaction,
      "Server Only",
      "Ticket commands can only be used inside a server.",
    );
    return null;
  }
  const ticket = await currentTicket(interaction, services);
  if (!ticket || ticket.guildId !== guildId) return null;
  const config = await getTicketsConfig(services, guildId);
  const context = accessContextFromInteraction(interaction);
  if (!context) return null;
  const access = await ticketAccess(
    services,
    context,
    config,
    ticket.category?.staffRoleIds ?? [],
  );
  if (options.staffOnly && !access.isStaff) {
    await replyError(
      interaction,
      "Staff Only",
      "You need a ticket staff role or the **tickets.manage** permit to do that.",
    );
    return null;
  }
  if (options.openOnly && ticket.status !== "open") {
    await replyError(
      interaction,
      "Ticket Closed",
      "This ticket is already closed and can no longer be changed.",
    );
    return null;
  }
  return { ticket, config, access };
}

export function formatCategories(
  categories: readonly TicketCategoryRecord[],
): string[] {
  return categories.map((category) => {
    const roles = category.staffRoleIds.length
      ? category.staffRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "none";
    const pings = category.pingRoleIds.length
      ? category.pingRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "none";
    const required = category.requiredRoleIds.length
      ? category.requiredRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "none";
    const limits = `Cooldown: ${category.cooldownSeconds}s · User limit: ${category.memberLimit || "∞"} · Category limit: ${category.totalLimit || "∞"} · Claiming: ${category.claimingEnabled ? "on" : "off"} · Feedback: ${category.feedbackEnabled ? "on" : "off"}`;
    return `${category.emoji ? `${category.emoji} ` : ""}**${category.name}**${category.enabled ? "" : " *(disabled)*"} — ${category.description ?? "No description"}\n-# Staff: ${roles} · Ping: ${pings} · Required: ${required} · Priority: ${category.defaultPriority} · Questions: ${questionsOf(category).length} · Template: \`${category.namingTemplate}\`\n-# ${limits}`;
  });
}

export function clearable(value: string | null): string | null | undefined {
  if (value === null) return undefined;
  return value === "-" ? null : value;
}
