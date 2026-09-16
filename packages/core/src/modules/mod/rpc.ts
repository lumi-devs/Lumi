import { container } from "@sapphire/framework";
import type { ModerationCase } from "@prisma/client";
import { modRpc } from "@lumi/contracts/rpc";
import type { AppealVerifyResult } from "@lumi/contracts/views";
import { verifyAppealToken } from "./services/appeal-token.js";
import { implementRpc, requireGuildId } from "#lib/rpc/implement.js";
import { paginate } from "#lib/rpc/validation.js";
import {
  removeThresholdRule,
  setThresholdRule,
} from "./services/threshold-rules.js";

// Only ban/timeout cases are appealable - matches BanAction/MuteAction, the
// only two call sites that ever DM an appeal link.
const AppealableCaseActions = new Set(["ban", "mute"]);

type AppealTokenResolution =
  | { ok: false; reason: string }
  | { ok: true; moderationCase: ModerationCase; userId: string };

async function resolveAppealToken(
  guildId: string,
  caseId: number,
  token: string,
): Promise<AppealTokenResolution> {
  const payload = verifyAppealToken(token);
  if (!payload || payload.guildId !== guildId || payload.caseId !== caseId) {
    return { ok: false, reason: "This appeal link is invalid or has expired." };
  }

  const moderationCase = await container.db.moderation.getModerationCaseById(caseId);
  if (
    !moderationCase ||
    moderationCase.guildId !== guildId ||
    moderationCase.userId !== payload.userId
  ) {
    return { ok: false, reason: "This appeal link is invalid or has expired." };
  }
  if (!AppealableCaseActions.has(moderationCase.action)) {
    return { ok: false, reason: "This case can't be appealed." };
  }

  return { ok: true, moderationCase, userId: payload.userId };
}

async function verifyAppeal(
  guildId: string,
  caseId: number,
  token: string,
): Promise<AppealVerifyResult> {
  const resolved = await resolveAppealToken(guildId, caseId, token);
  if (!resolved.ok) return { valid: false, reason: resolved.reason };

  const existing = await container.db.appeals.findByCaseId(caseId);
  return {
    valid: true,
    case: {
      caseNumber: resolved.moderationCase.caseNumber,
      action: resolved.moderationCase.action,
      reason: resolved.moderationCase.reason,
      createdAt: resolved.moderationCase.createdAt.toISOString(),
    },
    existingStatus: existing?.status ?? null,
  };
}

export const modRpcHandlers = implementRpc(modRpc, {
  "guild.cases.list": async ({ guildId, input }) => {
    const { page, pageSize, skip, take } = paginate(input);
    const { cases, total } = await container.db.moderation.listCases(guildId, {
      action: input.action,
      userId: input.userId,
      moderatorId: input.moderatorId,
      skip,
      take,
    });
    return {
      cases: cases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        userId: c.userId,
        moderatorId: c.moderatorId,
        action: c.action,
        reason: c.reason,
        duration: c.duration,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        active: c.active,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  },

  "guild.cases.revoke": async ({ guildId, input }) => {
    const { caseNumber } = input;
    const moderationCase = await container.db.moderation.getModerationCase(
      guildId,
      caseNumber,
    );
    if (!moderationCase) throw new Error(`Case #${caseNumber} not found`);
    if (!moderationCase.active) {
      throw new Error(`Case #${caseNumber} is already revoked`);
    }

    await container.db.moderation.liftModerationCase(moderationCase.id);
    return { success: true, caseNumber };
  },

  "guild.warnThresholds.list": async ({ guildId }) => {
    const thresholds = await container.db.moderation.getWarnThresholds(guildId);
    return {
      thresholds: thresholds.map((t) => ({
        warnCount: t.warnCount,
        action: t.action,
        duration: t.duration,
      })),
    };
  },

  "guild.warnThresholds.set": async ({ guildId, input }) => {
    const { warnCount, action, duration } = input;
    if (action === null) {
      await removeThresholdRule(container, guildId, warnCount);
      return { success: true, warnCount, deleted: true };
    }

    await container.db.ensureGuild(guildId);
    await setThresholdRule(container, guildId, warnCount, action, duration);
    return { success: true, warnCount, deleted: false };
  },

  "guild.modNotes.list": async ({ guildId, input }) => {
    const notes = await container.db.modNotes.listForUser(guildId, input.userId);
    return {
      notes: notes.map((n) => ({
        id: n.id,
        userId: n.userId,
        authorId: n.authorId,
        message: n.message,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  },

  "guild.modNotes.add": async ({ guildId, actorId, input }) => {
    await container.db.ensureGuild(guildId);
    const note = await container.db.modNotes.create(
      guildId,
      input.userId,
      actorId,
      input.message,
    );
    return {
      success: true,
      note: {
        id: note.id,
        userId: note.userId,
        authorId: note.authorId,
        message: note.message,
        createdAt: note.createdAt.toISOString(),
      },
    };
  },

  "guild.modNotes.remove": async ({ guildId, input }) => {
    const deleted = await container.db.modNotes.delete(guildId, input.id);
    return { success: true, deleted };
  },

  // Reachable by a punished user with no dashboard access at all:
  // authorization is the signed token, not the actor or a session.
  "guild.appeals.verify": ({ guildId, input }) =>
    verifyAppeal(requireGuildId(guildId), input.caseId, input.token),

  // Public for the same reason as `guild.appeals.verify`, and re-verifies the
  // token before writing.
  "guild.appeals.submit": async ({ guildId, input }) => {
    const verifiedGuildId = requireGuildId(guildId);
    const resolved = await resolveAppealToken(
      verifiedGuildId,
      input.caseId,
      input.token,
    );
    if (!resolved.ok) throw new Error(resolved.reason);

    const existing = await container.db.appeals.findByCaseId(input.caseId);
    if (existing) {
      throw new Error("An appeal has already been submitted for this case.");
    }

    await container.db.ensureGuild(verifiedGuildId);
    const appeal = await container.db.appeals.create(
      verifiedGuildId,
      resolved.userId,
      input.caseId,
      input.message,
    );
    return {
      success: true,
      appeal: {
        id: appeal.id,
        status: appeal.status,
        createdAt: appeal.createdAt.toISOString(),
      },
    };
  },

  "guild.appeals.list": async ({ guildId, input }) => {
    const { page, pageSize, skip, take } = paginate(input);
    const { appeals, total } = await container.db.appeals.listForGuild(guildId, {
      status: input.status,
      skip,
      take,
    });
    const cases = await container.db.moderation.getModerationCasesByIds(
      appeals.map((a) => a.caseId),
    );
    const caseById = new Map(cases.map((c) => [c.id, c]));

    return {
      appeals: appeals.map((a) => ({
        id: a.id,
        guildId: a.guildId,
        userId: a.userId,
        caseId: a.caseId,
        caseNumber: caseById.get(a.caseId)?.caseNumber ?? 0,
        action: caseById.get(a.caseId)?.action ?? "unknown",
        status: a.status,
        message: a.message,
        reviewedBy: a.reviewedBy,
        reviewedAt: a.reviewedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  },

  "guild.appeals.review": async ({ guildId, actorId, input }) => {
    const { id, status } = input;
    const appeal = await container.db.appeals.review(guildId, id, status, actorId);
    if (!appeal) throw new Error(`Appeal #${id} not found or already reviewed`);

    if (
      status === "denied_blacklisted" &&
      !(await container.db.access.isUserBlocklisted(appeal.userId, guildId))
    ) {
      await container.db.access.addBlocklistEntry(
        appeal.userId,
        actorId,
        "Appeal denied — blacklisted",
        guildId,
      );
    }

    return {
      success: true,
      appeal: {
        id: appeal.id,
        status: appeal.status,
        reviewedBy: appeal.reviewedBy,
        reviewedAt: appeal.reviewedAt?.toISOString() ?? null,
      },
    };
  },
});
