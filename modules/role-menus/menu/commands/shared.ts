import type { ModuleServices } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type APIInteractionGuildMember,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { MaxTempDurationSeconds } from "../config.js";
import { formatTempDuration } from "../selection.js";
import { findGroup, type GroupRecord } from "../service.js";
import { groupMode } from "../ui.js";

export const ModuleName = "role-menus-menu";
export const PermitNode = "rolemenu.manage";

export function roleIdsOf(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
): string[] {
  if (!member) return [];
  const roles: unknown = member.roles;
  if (Array.isArray(roles)) {
    return roles.filter(
      (roleId): roleId is string => typeof roleId === "string",
    );
  }
  const cache = (roles as { cache?: Map<string, unknown> } | undefined)?.cache;
  return cache ? [...cache.keys()] : [];
}

export async function canManage(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
  services: ModuleServices,
): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }
  try {
    const result = await services.permits.explainPermit(
      {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roleIds: roleIdsOf(interaction.member),
        channelId: interaction.channelId,
        guildOwnerId: interaction.guild?.ownerId,
        permitNode: PermitNode,
      },
      services.client,
    );
    return result?.allowed === true;
  } catch (error) {
    services.observability?.logger?.warn?.("role menu permit check failed", {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error,
    });
    return false;
  }
}

export function missingGuildCard() {
  return makeErrorCard("Server Only", "Role menus only work inside a server.");
}

export function disabledCard() {
  return makeErrorCard(
    "Module Disabled",
    "The Role Menus module is disabled on this server.",
  );
}

export async function resolveGroupOrReply(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  reference: string,
): Promise<GroupRecord | null> {
  const group = await findGroup(services, interaction.guildId!, reference);
  if (!group) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Unknown Role Menu",
          `No role menu named or identified by \`${reference}\` exists.`,
        ),
      ),
    );
    return null;
  }
  return group;
}

export function normalizeMax(
  raw: number | null,
  fallback: number,
): number | null {
  const value = raw ?? fallback;
  return value > 0 ? value : null;
}

export function normalizeTemp(
  raw: number | null,
  fallback: number,
): number | null {
  const value = raw ?? fallback;
  if (value <= 0) return null;
  return Math.min(value, MaxTempDurationSeconds);
}

export function validationForTemp(value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1) {
    return "Temporary duration must be at least 1 second, or 0 for permanent.";
  }
  if (value > MaxTempDurationSeconds) {
    return "Temporary duration cannot exceed 30 days.";
  }
  return null;
}

export function validationForMax(value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 25) {
    return "Maximum selections must be between 1 and 25, or 0 for unlimited.";
  }
  return null;
}

export function groupSummary(
  group: Omit<GroupRecord, "options"> & {
    readonly options: readonly unknown[];
  },
): string {
  const options = group.options.length;
  const temp = formatTempDuration(group.tempDurationSeconds);
  const limit =
    groupMode(group) === "single"
      ? "single"
      : group.maxSelections && group.maxSelections > 0
        ? `up to ${group.maxSelections}`
        : "unlimited";
  return `**${group.name}** — ${groupMode(group)} (${limit}) · ${options} option${options === 1 ? "" : "s"} · ${temp}${group.requireOne ? " · one required" : ""}${group.autoToggle ? " · auto-toggle" : ""}`;
}
