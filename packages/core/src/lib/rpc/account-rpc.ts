import {
  CodedRpcError,
  RpcFailureCodes,
  accountRpc,
} from "@lumi/contracts/rpc";
import { executeGdprDeletion, executeGdprExport } from "#lib/gdpr.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { implementRpc } from "#lib/rpc/implement.js";

export const accountRpcHandlers = implementRpc(accountRpc, {
  // Self-check only: tells the caller whether *their own* actorId is a bot
  // owner, so the dashboard defers to `PermitResolver.isBotOwner`'s
  // application-owner fallback instead of keeping its own env-var list.
  "auth.whoami": ({ actorId }) => ({
    isBotOwner: actorId ? PermitResolver.isBotOwner(actorId) : false,
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
    if (actorId !== input.userId && !PermitResolver.isBotOwner(actorId)) {
      throw new CodedRpcError(
        RpcFailureCodes.Forbidden,
        "Not authorized to export this user's data.",
      );
    }
    return { success: true, data: await executeGdprExport(input.userId) };
  },
});
