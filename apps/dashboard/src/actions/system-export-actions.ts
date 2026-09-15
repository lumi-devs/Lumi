"use server";

import { requireBotOwner } from "#/lib/auth-guards";
import { isRateLimited } from "#/lib/rate-limit";
import { rpc } from "#/lib/rpc";
import { fetchAllPages } from "#/lib/export-pages";
import type { AuditEntryView, BlocklistEntryView } from "@lumi/contracts/views";
import type { ExportResult } from "./guild-export-actions";

export async function exportSystemAuditLog(
  filter: { action?: string; userId?: string; guildId?: string; platform?: "discord" | "web" } = {},
): Promise<ExportResult<AuditEntryView>> {
  const session = await requireBotOwner();
  if (await isRateLimited(`system-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await fetchAllPages<AuditEntryView>((page, pageSize) =>
      rpc("system.audit.list", {
        actorId: session.userId,
        data: { ...filter, page, pageSize },
      }).then((data) => ({ items: data.entries, total: data.total })),
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
      rpc("system.blocklist.list", {
        actorId: session.userId,
        data: { page, pageSize },
      }).then((data) => ({ items: data.entries, total: data.total })),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}
