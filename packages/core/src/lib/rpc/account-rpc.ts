import { container } from "@sapphire/framework";
import {
  CodedRpcError,
  RpcFailureCodes,
  accountRpc,
} from "@lumi/contracts/rpc";
import {
  executeGdprDeletion,
  executeGdprExport,
  startGdprExportJob,
} from "#lib/gdpr.js";
import { signGdprExportToken } from "#lib/gdpr-export-token.js";
import { authorize } from "#lib/permissions/authorize.js";
import { implementRpc } from "#lib/rpc/implement.js";

async function canAccessUserData(
  actorId: string,
  userId: string,
): Promise<boolean> {
  return (
    actorId === userId ||
    (await authorize({ userId: actorId }, { kind: "botOwner" }))
  );
}

export const accountRpcHandlers = implementRpc(accountRpc, {
  // Self-check only: tells the caller whether *their own* actorId is a bot
  // owner, so the dashboard defers to `authorize()`'s bot-owner check
  // (application-owner fallback) instead of keeping its own env-var list.
  "auth.whoami": async ({ actorId }) => ({
    isBotOwner: actorId ? await authorize({ userId: actorId }, { kind: "botOwner" }) : false,
  }),

  "global.gdpr.delete": async ({ input }) => {
    const { failedModules } = await executeGdprDeletion(
      input.userId,
      input.requester,
    );
    return failedModules.length > 0
      ? { success: false, failedModules }
      : { success: true };
  },

  // A user may always export their own data; exporting someone else's
  // requires Bot Owner.
  "global.gdpr.export": async ({ actorId, input }) => {
    if (!(await canAccessUserData(actorId, input.userId))) {
      throw new CodedRpcError(
        RpcFailureCodes.Forbidden,
        "Not authorized to export this user's data.",
      );
    }
    return { success: true, data: await executeGdprExport(input.userId) };
  },

  "global.gdpr.export.start": async ({ actorId, input }) => {
    if (!(await canAccessUserData(actorId, input.userId))) {
      throw new CodedRpcError(
        RpcFailureCodes.Forbidden,
        "Not authorized to export this user's data.",
      );
    }
    const jobId = await startGdprExportJob(input.userId, actorId);
    return { jobId };
  },

  "global.gdpr.export.status": async ({ actorId, input }) => {
    const job = await container.db.gdprExportJobs.findById(input.jobId);
    if (!job) {
      throw new CodedRpcError(RpcFailureCodes.HandlerError, "Export job not found.");
    }
    if (!(await canAccessUserData(actorId, job.userId))) {
      throw new CodedRpcError(
        RpcFailureCodes.Forbidden,
        "Not authorized to view this export job.",
      );
    }

    const base = {
      status: job.status,
      error: job.error ?? undefined,
      sizeBytes: job.sizeBytes ?? undefined,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      expiresAt: job.expiresAt?.toISOString(),
    };

    if (job.status !== "done" || !job.filePath || !job.expiresAt) return base;

    const ttlMs = job.expiresAt.getTime() - Date.now();
    if (ttlMs <= 0) return base;

    return {
      ...base,
      download: {
        token: signGdprExportToken(job.id, ttlMs),
        expiresAt: job.expiresAt.toISOString(),
      },
    };
  },
});
