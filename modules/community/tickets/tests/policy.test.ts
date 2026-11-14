import type { ModuleServices } from "@lumi/module-kit";
import { describe, expect, it } from "vitest";
import { defaultTicketsConfig } from "../config.ts";
import {
  claimingEnabledFor,
  feedbackEnabledFor,
  validateTicketOpen,
} from "../policy.ts";
import type { TicketCategoryRecord, TicketPanelRecord } from "../repository.ts";

const panel: TicketPanelRecord = {
  id: "panel-1",
  guildId: "guild-1",
  channelId: "channel-1",
  messageId: null,
  title: "Support",
  description: null,
  categoryIds: ["category-1"],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const category: TicketCategoryRecord = {
  id: "category-1",
  guildId: "guild-1",
  name: "Support",
  emoji: null,
  description: null,
  staffRoleIds: [],
  pingRoleIds: [],
  requiredRoleIds: [],
  questions: [],
  namingTemplate: "ticket-{user}",
  defaultPriority: "normal",
  openingMessage: null,
  cooldownSeconds: 0,
  memberLimit: 0,
  totalLimit: 0,
  claimingEnabled: true,
  feedbackEnabled: true,
  position: 0,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function services(input: {
  panel?: TicketPanelRecord | null;
  category?: TicketCategoryRecord | null;
  blacklisted?: boolean;
  open?: number;
  memberOpen?: number;
  categoryOpen?: number;
  latest?: { id: string; createdAt: Date | string } | null;
  config?: unknown;
}): ModuleServices {
  return {
    moduleName: "tickets",
    moduleConfig: {
      read: async () => input.config ?? {},
    },
    observability: { logger: { warn: () => undefined } },
    helpers: {
      tickets: {
        findPanel: async () =>
          input.panel === undefined ? panel : input.panel,
        findCategory: async () =>
          input.category === undefined ? category : input.category,
        isBlacklisted: async () => input.blacklisted ?? false,
        countOpenTickets: async () => input.open ?? 0,
        countOpenTicketsForCategory: async () => input.memberOpen ?? 0,
        countOpenTicketsInCategory: async () => input.categoryOpen ?? 0,
        findLatestTicketForUserCategory: async () => input.latest ?? null,
      },
    },
  } as unknown as ModuleServices;
}

const openInput = {
  guildId: "guild-1",
  userId: "user-1",
  roleIds: [] as string[],
  panelId: "panel-1",
  categoryId: "category-1",
};

describe("ticket open policy", () => {
  it("allows a valid open and returns the resolved records", async () => {
    const result = await validateTicketOpen(services({}), openInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.panel.id).toBe("panel-1");
      expect(result.category.id).toBe("category-1");
      expect(result.config.maxOpenPerUser).toBe(3);
    }
  });

  it("rejects missing panels, disabled categories, and blacklists", async () => {
    expect(
      (await validateTicketOpen(services({ panel: null }), openInput)).ok,
    ).toBe(false);
    expect(
      (
        await validateTicketOpen(
          services({ category: { ...category, enabled: false } }),
          openInput,
        )
      ).ok,
    ).toBe(false);
    expect(
      (await validateTicketOpen(services({ blacklisted: true }), openInput)).ok,
    ).toBe(false);
  });

  it("enforces required roles and open-ticket limits", async () => {
    const blockedRole = await validateTicketOpen(
      services({ category: { ...category, requiredRoleIds: ["role-1"] } }),
      openInput,
    );
    expect(blockedRole.ok).toBe(false);
    if (!blockedRole.ok) expect(blockedRole.title).toBe("Role Required");

    const allowedRole = await validateTicketOpen(
      services({ category: { ...category, requiredRoleIds: ["role-1"] } }),
      { ...openInput, roleIds: ["role-1"] },
    );
    expect(allowedRole.ok).toBe(true);

    expect(
      (await validateTicketOpen(services({ open: 3 }), openInput)).ok,
    ).toBe(false);

    const memberLimited = await validateTicketOpen(
      services({
        category: { ...category, memberLimit: 2 },
        memberOpen: 2,
      }),
      openInput,
    );
    expect(memberLimited.ok).toBe(false);

    const totalLimited = await validateTicketOpen(
      services({
        category: { ...category, totalLimit: 5 },
        categoryOpen: 5,
      }),
      openInput,
    );
    expect(totalLimited.ok).toBe(false);
  });

  it("enforces the per-user category cooldown", async () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const result = await validateTicketOpen(
      services({
        category: { ...category, cooldownSeconds: 3600 },
        latest: { id: "old", createdAt: new Date("2026-11-03T11:30:00Z") },
      }),
      { ...openInput, now },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.title).toBe("Cooldown Active");

    const expired = await validateTicketOpen(
      services({
        category: { ...category, cooldownSeconds: 3600 },
        latest: { id: "old", createdAt: new Date("2026-11-03T10:00:00Z") },
      }),
      { ...openInput, now },
    );
    expect(expired.ok).toBe(true);
  });

  it("combines category and global feedback/claiming toggles", () => {
    expect(feedbackEnabledFor(defaultTicketsConfig, category)).toBe(true);
    expect(
      feedbackEnabledFor(defaultTicketsConfig, {
        ...category,
        feedbackEnabled: false,
      }),
    ).toBe(false);
    expect(
      feedbackEnabledFor(
        { ...defaultTicketsConfig, feedbackEnabled: false },
        category,
      ),
    ).toBe(false);
    expect(claimingEnabledFor(category)).toBe(true);
    expect(claimingEnabledFor({ ...category, claimingEnabled: false })).toBe(
      false,
    );
    expect(claimingEnabledFor(null)).toBe(true);
  });
});
