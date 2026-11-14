import type { ModuleServices } from "@lumi/module-kit";
import type { TicketsConfig } from "./config.js";
import { getTicketsConfig } from "./config.js";
import {
  countOpenTickets,
  countOpenTicketsForCategory,
  countOpenTicketsInCategory,
  findCategory,
  findLatestTicketForUserCategory,
  findPanel,
  isBlacklisted,
  type TicketCategoryRecord,
  type TicketPanelRecord,
} from "./repository.js";

export interface OpenPolicyInput {
  guildId: string;
  userId: string;
  roleIds: readonly string[];
  panelId: string;
  categoryId: string;
  now?: Date;
}

export type OpenPolicyResult =
  | {
      ok: true;
      config: TicketsConfig;
      panel: TicketPanelRecord;
      category: TicketCategoryRecord;
    }
  | { ok: false; title: string; body: string };

export function feedbackEnabledFor(
  config: TicketsConfig,
  category: TicketCategoryRecord | null | undefined,
): boolean {
  return config.feedbackEnabled && (category?.feedbackEnabled ?? true);
}

export function claimingEnabledFor(
  category: TicketCategoryRecord | null | undefined,
): boolean {
  return category?.claimingEnabled ?? true;
}

function roleList(ids: readonly string[]): string {
  return ids.map((id) => `<@&${id}>`).join(", ");
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export async function validateTicketOpen(
  services: ModuleServices,
  input: OpenPolicyInput,
): Promise<OpenPolicyResult> {
  const panel = await findPanel(services, input.panelId);
  if (!panel || panel.guildId !== input.guildId) {
    return {
      ok: false,
      title: "Panel Missing",
      body: "This ticket panel no longer exists.",
    };
  }

  const category = await findCategory(
    services,
    input.guildId,
    input.categoryId,
  );
  if (!category?.enabled || !panel.categoryIds.includes(category.id)) {
    return {
      ok: false,
      title: "Category Unavailable",
      body: "That ticket category is not available on this panel.",
    };
  }

  const config = await getTicketsConfig(services, input.guildId);
  if (await isBlacklisted(services, input.guildId, input.userId)) {
    return {
      ok: false,
      title: "Ticket Restricted",
      body: "You are blacklisted from opening tickets in this server.",
    };
  }

  const missingRoles = category.requiredRoleIds.filter(
    (roleId) => !input.roleIds.includes(roleId),
  );
  if (missingRoles.length > 0) {
    return {
      ok: false,
      title: "Role Required",
      body: `You need ${roleList(missingRoles)} to open a **${category.name}** ticket.`,
    };
  }

  const openCount = await countOpenTickets(
    services,
    input.guildId,
    input.userId,
  );
  if (openCount >= config.maxOpenPerUser) {
    return {
      ok: false,
      title: "Open Ticket Limit",
      body: `You already have ${openCount} open ticket(s). The server limit is ${config.maxOpenPerUser}.`,
    };
  }

  if (category.memberLimit > 0) {
    const categoryOpen = await countOpenTicketsForCategory(
      services,
      input.guildId,
      input.userId,
      category.id,
    );
    if (categoryOpen >= category.memberLimit) {
      return {
        ok: false,
        title: "Category Limit",
        body: `You already have ${categoryOpen} open **${category.name}** ticket(s). The category limit is ${category.memberLimit}.`,
      };
    }
  }

  if (category.totalLimit > 0) {
    const totalOpen = await countOpenTicketsInCategory(
      services,
      input.guildId,
      category.id,
    );
    if (totalOpen >= category.totalLimit) {
      return {
        ok: false,
        title: "Category Full",
        body: `**${category.name}** already has ${totalOpen} open ticket(s). The category limit is ${category.totalLimit}.`,
      };
    }
  }

  if (category.cooldownSeconds > 0) {
    const latest = await findLatestTicketForUserCategory(
      services,
      input.guildId,
      input.userId,
      category.id,
    );
    if (latest) {
      const created = new Date(latest.createdAt).getTime();
      const now = (input.now ?? new Date()).getTime();
      const elapsed = Math.max(0, Math.floor((now - created) / 1000));
      if (Number.isFinite(created) && elapsed < category.cooldownSeconds) {
        return {
          ok: false,
          title: "Cooldown Active",
          body: `Wait ${formatDuration(category.cooldownSeconds - elapsed)} before opening another **${category.name}** ticket.`,
        };
      }
    }
  }

  return { ok: true, config, panel, category };
}
