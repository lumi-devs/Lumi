import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RpcActions } from "@lumi/contracts";
import {
  AppealReviewSchema,
  AppealSubmitSchema,
  AppealVerifySchema,
  AppealsListSchema,
  BlocklistAddSchema,
  BlocklistListSchema,
  BlocklistRemoveSchema,
  IgnoredChannelSchema,
  ModNoteAddSchema,
  ModNoteListSchema,
  ModNoteRemoveSchema,
  paginate,
  parsePayload,
  requireGuildId,
  requireGuildManager,
  resolveAppealToken,
  verifyGuildAccess,
} from "../lib/helpers.js";

export function registerModerationRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildBlocklistList, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const filter = parsePayload(BlocklistListSchema, req.data ?? {});
    const { page, pageSize, skip, take } = paginate(filter);

    const { entries, total } = await container.db.access.listBlocklist(
      guildId,
      { skip, take },
    );

    return {
      entries: entries.map((e) => ({
        id: e.id,
        userId: e.userId,
        reason: e.reason,
        blockedBy: e.blockedBy,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });

  registerRpcHandler(RpcActions.guildBlocklistAdd, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = await requireGuildManager(guildId, req.actorId);
    const { userId, reason } = parsePayload(BlocklistAddSchema, req.data);

    if (await container.db.access.isUserBlocklisted(userId, guildId)) {
      throw new Error(`${userId} is already blocklisted in this server`);
    }

    await container.db.access.addBlocklistEntry(
      userId,
      actorId,
      reason,
      guildId,
    );
    return { success: true, userId };
  });

  registerRpcHandler(RpcActions.guildBlocklistRemove, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { userId } = parsePayload(BlocklistRemoveSchema, req.data);
    await container.db.access.removeBlocklistEntry(userId, guildId);
    return { success: true, userId };
  });

  registerRpcHandler(RpcActions.guildModNotesList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { userId } = parsePayload(ModNoteListSchema, req.data);
    const notes = await container.db.modNotes.listForUser(guildId, userId);

    return {
      notes: notes.map((n) => ({
        id: n.id,
        userId: n.userId,
        authorId: n.authorId,
        message: n.message,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  });

  registerRpcHandler(RpcActions.guildModNotesAdd, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = await requireGuildManager(guildId, req.actorId);
    const { userId, message } = parsePayload(ModNoteAddSchema, req.data);

    await container.db.ensureGuild(guildId);
    const note = await container.db.modNotes.create(
      guildId,
      userId,
      actorId,
      message,
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
  });

  registerRpcHandler(RpcActions.guildModNotesRemove, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { id } = parsePayload(ModNoteRemoveSchema, req.data);
    const deleted = await container.db.modNotes.delete(guildId, id);
    return { success: true, deleted };
  });

  // Public, unauthenticated: reachable by a punished user with no dashboard
  // access at all. Authorization is the signed token, not `actorId`/session.
  registerRpcHandler(RpcActions.guildAppealsVerify, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const { caseId, token } = parsePayload(AppealVerifySchema, req.data);

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
  });

  // Public, unauthenticated - see guildAppealsVerify above.
  registerRpcHandler(RpcActions.guildAppealsSubmit, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const { caseId, token, message } = parsePayload(
      AppealSubmitSchema,
      req.data,
    );

    const resolved = await resolveAppealToken(guildId, caseId, token);
    if (!resolved.ok) throw new Error(resolved.reason);

    const existing = await container.db.appeals.findByCaseId(caseId);
    if (existing) {
      throw new Error("An appeal has already been submitted for this case.");
    }

    await container.db.ensureGuild(guildId);
    const appeal = await container.db.appeals.create(
      guildId,
      resolved.userId,
      caseId,
      message,
    );
    return {
      success: true,
      appeal: {
        id: appeal.id,
        status: appeal.status,
        createdAt: appeal.createdAt.toISOString(),
      },
    };
  });

  registerRpcHandler(RpcActions.guildAppealsList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const filter = parsePayload(AppealsListSchema, req.data ?? {});
    const { page, pageSize, skip, take } = paginate(filter);

    const { appeals, total } = await container.db.appeals.listForGuild(
      guildId,
      { status: filter.status, skip, take },
    );
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
  });

  registerRpcHandler(RpcActions.guildAppealsReview, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = await requireGuildManager(guildId, req.actorId);
    const { id, status } = parsePayload(AppealReviewSchema, req.data);

    const appeal = await container.db.appeals.review(
      guildId,
      id,
      status,
      actorId,
    );
    if (!appeal)
      throw new Error(`Appeal #${id} not found or already reviewed`);

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
  });

  registerRpcHandler(RpcActions.guildAfkList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const entries = await container.db.afk.findForGuild(guildId);

    return {
      entries: entries.map((e) => ({
        userId: e.userId,
        reason: e.reason,
        since: e.since.toISOString(),
      })),
    };
  });

  registerRpcHandler(RpcActions.guildIgnoredList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const entries = await container.db.access.listIgnoreEntries(guildId);

    return {
      entries: entries.map((e) => ({
        id: e.id,
        channelId: e.channelId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });

  registerRpcHandler(RpcActions.guildIgnoredAdd, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { channelId } = parsePayload(IgnoredChannelSchema, req.data);

    const existing = await container.db.access.listIgnoreEntries(guildId);
    if (existing.some((e) => e.channelId === channelId)) {
      throw new Error(
        channelId
          ? `<#${channelId}> is already ignored`
          : "This server is already ignored",
      );
    }

    await container.db.ensureGuild(guildId);
    await container.db.access.addIgnoreEntry(guildId, channelId);
    return { success: true, channelId };
  });

  registerRpcHandler(RpcActions.guildIgnoredRemove, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { channelId } = parsePayload(IgnoredChannelSchema, req.data);
    await container.db.access.removeIgnoreEntry(guildId, channelId);
    return { success: true, channelId };
  });
}

export function unregisterModerationRpcHandlers(): void {
  rpcHandlers.delete(RpcActions.guildBlocklistList);
  rpcHandlers.delete(RpcActions.guildBlocklistAdd);
  rpcHandlers.delete(RpcActions.guildBlocklistRemove);
  rpcHandlers.delete(RpcActions.guildModNotesList);
  rpcHandlers.delete(RpcActions.guildModNotesAdd);
  rpcHandlers.delete(RpcActions.guildModNotesRemove);
  rpcHandlers.delete(RpcActions.guildAppealsVerify);
  rpcHandlers.delete(RpcActions.guildAppealsSubmit);
  rpcHandlers.delete(RpcActions.guildAppealsList);
  rpcHandlers.delete(RpcActions.guildAppealsReview);
  rpcHandlers.delete(RpcActions.guildAfkList);
  rpcHandlers.delete(RpcActions.guildIgnoredList);
  rpcHandlers.delete(RpcActions.guildIgnoredAdd);
  rpcHandlers.delete(RpcActions.guildIgnoredRemove);
}
