"use server";

import { rpc } from "#/lib/rpc";
import { fetchAllPages } from "#/lib/export-pages";
import type { AuditEntryView, BlocklistEntryView } from "@lumi/contracts/views";
import type { ExportResult } from "./guild-export-actions";
import { ownerAction } from "./_guard";

export async function exportSystemAuditLog(
  filter: { action?: string; userId?: string; guildId?: string; platform?: "discord" | "web" } = {},
): Promise<ExportResult<AuditEntryView>> {
  return ownerAction(
    async (session) => {
      const items = await fetchAllPages<AuditEntryView>((page, pageSize) =>
        rpc("system.audit.list", {
          actorId: session.userId,
          data: { ...filter, page, pageSize },
        }).then((data) => ({ items: data.entries, total: data.total })),
      );
      return { ok: true, items };
    },
    { keyPrefix: "system-export", limit: 5, windowMs: 60_000 },
  );
}

export async function exportSystemBlocklist(): Promise<ExportResult<BlocklistEntryView>> {
  return ownerAction(
    async (session) => {
      const items = await fetchAllPages<BlocklistEntryView>((page, pageSize) =>
        rpc("system.blocklist.list", {
          actorId: session.userId,
          data: { page, pageSize },
        }).then((data) => ({ items: data.entries, total: data.total })),
      );
      return { ok: true, items };
    },
    { keyPrefix: "system-export", limit: 5, windowMs: 60_000 },
  );
}
