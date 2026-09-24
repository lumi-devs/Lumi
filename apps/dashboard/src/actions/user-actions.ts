"use server";

import { type GdprExportResult } from "@lumi/contracts/rpc";
import { requireSession } from "#/lib/auth-guards";
import { rpc } from "#/lib/rpc";
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
    const res = await rpc("global.gdpr.export", {
      actorId: session.userId,
      data: { userId: session.userId },
    });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}
