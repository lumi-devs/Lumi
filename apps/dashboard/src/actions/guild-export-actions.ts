"use server";

import type { AppealStatus } from "@lumi/contracts/rpc";
import { rpc } from "#/lib/rpc";
import { fetchAllPages } from "#/lib/export-pages";
import type { AppealView, AuditEntryView, BlocklistEntryView, ConfigHistoryEntryView, ModerationCaseView, ModNoteView } from "@lumi/contracts/views";
import type { ActionResult } from "./guild-actions";
import { guildAction } from "./_guard";

export interface ExportResult<T> extends ActionResult {
  items?: T[];
}

export async function exportGuildCases(
  guildId: string,
  filter: { action?: string; userId?: string; moderatorId?: string } = {},
): Promise<ExportResult<ModerationCaseView>> {
  return guildAction(
    guildId,
    async (session) => {
      const items = await fetchAllPages<ModerationCaseView>((page, pageSize) =>
        rpc("guild.cases.list", {
          guildId,
          actorId: session.userId,
          data: { ...filter, page, pageSize },
        }).then((data) => ({ items: data.cases, total: data.total })),
      );
      return { ok: true, items };
    },
    { keyPrefix: "guild-export", limit: 5, windowMs: 60_000 },
  );
}

export async function exportGuildAuditLog(
  guildId: string,
  filter: { action?: string; userId?: string; platform?: "discord" | "web" } = {},
): Promise<ExportResult<AuditEntryView>> {
  return guildAction(
    guildId,
    async (session) => {
      const items = await fetchAllPages<AuditEntryView>((page, pageSize) =>
        rpc("guild.audit.list", {
          guildId,
          actorId: session.userId,
          data: { ...filter, page, pageSize },
        }).then((data) => ({ items: data.entries, total: data.total })),
      );
      return { ok: true, items };
    },
    { keyPrefix: "guild-export", limit: 5, windowMs: 60_000 },
  );
}

export async function exportGuildConfigHistory(
  guildId: string,
  filter: { moduleName?: string; key?: string; actorId?: string } = {},
): Promise<ExportResult<ConfigHistoryEntryView>> {
  return guildAction(
    guildId,
    async (session) => {
      const items = await fetchAllPages<ConfigHistoryEntryView>((page, pageSize) =>
        rpc("guild.history.list", {
          guildId,
          actorId: session.userId,
          data: { ...filter, page, pageSize },
        }).then((data) => ({ items: data.entries, total: data.total })),
      );
      return { ok: true, items };
    },
    { keyPrefix: "guild-export", limit: 5, windowMs: 60_000 },
  );
}

export async function exportGuildBlocklist(
  guildId: string,
): Promise<ExportResult<BlocklistEntryView>> {
  return guildAction(
    guildId,
    async (session) => {
      const items = await fetchAllPages<BlocklistEntryView>((page, pageSize) =>
        rpc("guild.blocklist.list", {
          guildId,
          actorId: session.userId,
          data: { page, pageSize },
        }).then((data) => ({ items: data.entries, total: data.total })),
      );
      return { ok: true, items };
    },
    { keyPrefix: "guild-export", limit: 5, windowMs: 60_000 },
  );
}

export async function exportGuildAppeals(
  guildId: string,
  filter: { status?: AppealStatus } = {},
): Promise<ExportResult<AppealView>> {
  return guildAction(
    guildId,
    async (session) => {
      const items = await fetchAllPages<AppealView>((page, pageSize) =>
        rpc("guild.appeals.list", {
          guildId,
          actorId: session.userId,
          data: { ...filter, page, pageSize },
        }).then((data) => ({ items: data.appeals, total: data.total })),
      );
      return { ok: true, items };
    },
    { keyPrefix: "guild-export", limit: 5, windowMs: 60_000 },
  );
}

export async function exportGuildModNotes(
  guildId: string,
  userId: string,
): Promise<ExportResult<ModNoteView>> {
  return guildAction(
    guildId,
    async (session) => {
      const result = await rpc("guild.modNotes.list", {
        guildId,
        actorId: session.userId,
        data: { userId },
      });
      const items = result.notes;
      return { ok: true, items };
    },
    { keyPrefix: "guild-export", limit: 5, windowMs: 60_000 },
  );
}
