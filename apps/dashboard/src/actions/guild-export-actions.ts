"use server";

import type { AppealStatus } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { isRateLimited } from "#/lib/rate-limit";
import {
  getGuildAppeals,
  getGuildAuditLog,
  getGuildBlocklist,
  getGuildCases,
  getGuildConfigHistory,
  getGuildModNotes,
} from "#/lib/dashboard-fetch";
import { fetchAllPages } from "#/lib/export-pages";
import type {
  AppealView,
  AuditEntryView,
  BlocklistEntryView,
  ConfigHistoryEntryView,
  ModerationCaseView,
  ModNoteView,
} from "#/lib/dashboard-data";
import type { ActionResult } from "./guild-actions";

export interface ExportResult<T> extends ActionResult {
  items?: T[];
}

export async function exportGuildCases(
  guildId: string,
  filter: { action?: string; userId?: string; moderatorId?: string } = {},
): Promise<ExportResult<ModerationCaseView>> {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await fetchAllPages<ModerationCaseView>((page, pageSize) =>
      getGuildCases(guildId, session.userId, { ...filter, page, pageSize }).then(
        (data) => ({ items: data.cases, total: data.total }),
      ),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}

export async function exportGuildAuditLog(
  guildId: string,
  filter: { action?: string; userId?: string; platform?: string } = {},
): Promise<ExportResult<AuditEntryView>> {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await fetchAllPages<AuditEntryView>((page, pageSize) =>
      getGuildAuditLog(guildId, session.userId, { ...filter, page, pageSize }).then(
        (data) => ({ items: data.entries, total: data.total }),
      ),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}

export async function exportGuildConfigHistory(
  guildId: string,
  filter: { moduleName?: string; key?: string; actorId?: string } = {},
): Promise<ExportResult<ConfigHistoryEntryView>> {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await fetchAllPages<ConfigHistoryEntryView>((page, pageSize) =>
      getGuildConfigHistory(guildId, session.userId, { ...filter, page, pageSize }).then(
        (data) => ({ items: data.entries, total: data.total }),
      ),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}

export async function exportGuildBlocklist(
  guildId: string,
): Promise<ExportResult<BlocklistEntryView>> {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await fetchAllPages<BlocklistEntryView>((page, pageSize) =>
      getGuildBlocklist(guildId, session.userId, { page, pageSize }).then(
        (data) => ({ items: data.entries, total: data.total }),
      ),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}

export async function exportGuildAppeals(
  guildId: string,
  filter: { status?: AppealStatus } = {},
): Promise<ExportResult<AppealView>> {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await fetchAllPages<AppealView>((page, pageSize) =>
      getGuildAppeals(guildId, session.userId, { ...filter, page, pageSize }).then(
        (data) => ({ items: data.appeals, total: data.total }),
      ),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}

export async function exportGuildModNotes(
  guildId: string,
  userId: string,
): Promise<ExportResult<ModNoteView>> {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-export:${session.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many requests — slow down." };
  }
  try {
    const items = await getGuildModNotes(guildId, session.userId, userId);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}
