"use server";

import { RpcActions, type GdprExportResult } from "@lumi/contracts";
import { requireSession } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import type { ActionResult } from "#/lib/action-result";

export interface GdprExportActionResult extends ActionResult {
  data?: GdprExportResult;
}

export async function exportMyData(): Promise<GdprExportActionResult> {
  const session = await requireSession();
  if (await isRateLimited(`gdpr-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const res = (await rpcCall(RpcActions.gdprExport, {
      actorId: session.userId,
      data: { userId: session.userId },
    })) as { data: GdprExportResult };
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}
