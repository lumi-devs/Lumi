import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import {
  removeThresholdRule,
  setThresholdRule,
} from "#utilities/thresholds.js";
import {
  CaseRevokeSchema,
  CasesListSchema,
  WarnThresholdSetSchema,
  parsePayload,
  requireGuildId,
  requireGuildManager,
  verifyGuildAccess,
} from "../lib/helpers.js";

export function registerCasesRpcHandlers(): void {
  registerRpcHandler(RPC_ACTIONS.guildCasesList, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const filter = parsePayload(CasesListSchema, req.data ?? {});

    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 25;
    const { cases, total } = await container.db.moderation.listCases(guildId, {
      action: filter.action,
      userId: filter.userId,
      moderatorId: filter.moderatorId,
      skip: (page - 1) * pageSize,
      take: pageSize,
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
  });

  registerRpcHandler(RPC_ACTIONS.guildCasesRevoke, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { caseNumber } = parsePayload(CaseRevokeSchema, req.data);

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
  });

  registerRpcHandler(RPC_ACTIONS.guildWarnThresholdsList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const thresholds =
      await container.db.moderation.getWarnThresholds(guildId);

    return {
      thresholds: thresholds.map((t) => ({
        warnCount: t.warnCount,
        action: t.action,
        duration: t.duration,
      })),
    };
  });

  registerRpcHandler(RPC_ACTIONS.guildWarnThresholdsSet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { warnCount, action, duration } = parsePayload(
      WarnThresholdSetSchema,
      req.data,
    );

    if (action === null) {
      await removeThresholdRule(container, guildId, warnCount);
      return { success: true, warnCount, deleted: true };
    }

    await container.db.ensureGuild(guildId);
    await setThresholdRule(container, guildId, warnCount, action, duration);
    return { success: true, warnCount, deleted: false };
  });
}

export function unregisterCasesRpcHandlers(): void {
  rpcHandlers.delete(RPC_ACTIONS.guildCasesList);
  rpcHandlers.delete(RPC_ACTIONS.guildCasesRevoke);
  rpcHandlers.delete(RPC_ACTIONS.guildWarnThresholdsList);
  rpcHandlers.delete(RPC_ACTIONS.guildWarnThresholdsSet);
}
