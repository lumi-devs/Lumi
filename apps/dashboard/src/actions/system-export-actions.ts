"use server";

import { requireBotOwner } from "#/lib/auth-guards";
import { isRateLimited } from "#/lib/rate-limit";
import { getSystemAuditLog, getSystemBlocklist } from "#/lib/dashboard-fetch";
import { fetchAllPages } from "#/lib/export-pages";
import type { AuditEntryView, BlocklistEntryView } from "#/lib/dashboard-data";
import type { ExportResult } from "./guild-export-actions";

export async function exportSystemAuditLog(
  filter: { action?: string; userId?: string; guildId?: string; platform?: string } = {},
): Promise<ExportResult<AuditEntryView>> {
  const session = await requireBotOwner();
  if (await isRateLimited(`system-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await fetchAllPages<AuditEntryView>((page, pageSize) =>
      getSystemAuditLog(session.userId, { ...filter, page, pageSize }).then(
        (data) => ({ items: data.entries, total: data.total }),
      ),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}

export async function exportSystemBlocklist(): Promise<ExportResult<BlocklistEntryView>> {
  const session = await requireBotOwner();
  if (await isRateLimited(`system-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await fetchAllPages<BlocklistEntryView>((page, pageSize) =>
      getSystemBlocklist(session.userId, { page, pageSize }).then(
        (data) => ({ items: data.entries, total: data.total }),
      ),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}
