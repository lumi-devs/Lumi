import type { Guild } from "discord.js";
import { AuditLogEvent } from "discord.js";

const RecentAuditEntryMs = 10_000;

export async function resolveAuditLogExecutor(
	guild: Guild,
	eventType: AuditLogEvent,
	targetId?: string,
	changeKey?: string,
): Promise<string | null> {
	const logs = await guild
		.fetchAuditLogs({ type: eventType, limit: 1 })
		.catch(() => null);
	const entry = logs?.entries.first();
	if (!entry || Date.now() - entry.createdTimestamp > RecentAuditEntryMs) {
		return null;
	}
	if (targetId !== undefined && entry.targetId !== targetId) {
		return null;
	}
	if (changeKey !== undefined && !entry.changes?.some((c) => c.key === changeKey)) {
		return null;
	}
	return entry.executorId;
}
