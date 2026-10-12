import { container } from "#src/lib/Services.js";
import {
  CodedRpcError,
  RpcFailureCodes,
  accountRpc,
} from "#src/contracts/rpc/Index.ts";
import {
  executeGdprDeletion,
  executeGdprExport,
  startGdprExportJob,
} from "#src/lib/gdpr/Requests.js";
import { signGdprExportToken } from "#src/lib/gdpr/ExportToken.js";
import { authorize } from "#src/lib/api/permissions/Authorize.js";
import { implementRpc } from "#src/lib/rpc/Implement.js";

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

  "auth.whoami": async ({ actorId }) => ({
    isBotOwner: actorId ? await authorize({ userId: actorId }, { kind: "botOwner" }) : false,
  }),

  "global.gdpr.delete": async ({ input }) => {
    const { failedModules } = await executeGdprDeletion(
      container,
      input.userId,
      input.requester,
    );
    return failedModules.length > 0
      ? { success: false, failedModules }
      : { success: true };
  },

  "global.gdpr.export": async ({ actorId, input }) => {
    if (!(await canAccessUserData(actorId, input.userId))) {
      throw new CodedRpcError(
        RpcFailureCodes.Forbidden,
        "Not authorized to export this user's data.",
      );
    }
    return { success: true, data: await executeGdprExport(container, input.userId) };
  },

  "global.gdpr.export.start": async ({ actorId, input }) => {
    if (!(await canAccessUserData(actorId, input.userId))) {
      throw new CodedRpcError(
        RpcFailureCodes.Forbidden,
        "Not authorized to export this user's data.",
      );
    }
    const jobId = await startGdprExportJob(container, input.userId, actorId);
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
