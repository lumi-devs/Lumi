import "server-only";
import { cache } from "react";
import { RpcActions } from "@lumi/contracts";
import { rpcCall } from "./rpc";
import type {
  AfkEntryView,
  AppealsListData,
  AppealVerifyResult,
  AuditListData,
  BlocklistListData,
  CasesListData,
  ConfigHistoryListData,
  ConfigOverrideView,
  DashboardData,
  IgnoredChannelView,
  ModNoteView,
  ModuleDataListData,
  PanicStateView,
  PermitView,
  SystemDashboardData,
  SystemShardsData,
  TempVcGeneratorView,
  TempVcRecordView,
  VerificationPanelView,
  WarnThresholdView,
} from "./dashboard-data";
import type {
  AppealsListPayload,
  AuditListPayload,
  BlocklistListPayload,
  CasesListPayload,
  ConfigHistoryListPayload,
  GuildBackupView,
  GuildSummaryView,
  ModuleDataListPayload,
  SystemAuditListPayload,
} from "@lumi/contracts";

export const getGuildDashboard = cache(
  async (guildId: string, actorId: string): Promise<DashboardData> => {
    const data = await rpcCall(RpcActions.guildDashboardGet, {
      guildId,
      actorId,
    });
    return data as DashboardData;
  },
);

/**
 * Decoration for the `/guilds` picker (icon/banner/member count per tile) -
 * unlike every other fetch here, failure degrades to "no summaries" instead
 * of propagating, since the picker's fallback tile treatment already covers
 * "we don't know this guild's banner" and a worker hiccup shouldn't take the
 * whole server list down with it.
 */
export async function getGuildSummaries(
  guildIds: string[],
  actorId: string,
): Promise<GuildSummaryView[]> {
  if (guildIds.length === 0) return [];
  try {
    const data = (await rpcCall(RpcActions.guildSummariesList, {
      actorId,
      data: { guildIds },
    })) as { summaries: GuildSummaryView[] };
    return data.summaries;
  } catch {
    return [];
  }
}

export const getGuildPermits = cache(
  async (guildId: string, actorId: string): Promise<PermitView[]> => {
    const data = (await rpcCall(RpcActions.guildPermitsList, {
      guildId,
      actorId,
    })) as { permits: PermitView[] };
    return data.permits;
  },
);

// Not `cache()`-wrapped: the filter is a fresh object per render, and
// React.cache keys arguments by identity, so memoization would never hit.
export async function getGuildCases(
  guildId: string,
  actorId: string,
  filter: CasesListPayload = {},
): Promise<CasesListData> {
  const data = await rpcCall(RpcActions.guildCasesList, {
    guildId,
    actorId,
    data: filter,
  });
  return data as CasesListData;
}

export const getGuildWarnThresholds = cache(
  async (guildId: string, actorId: string): Promise<WarnThresholdView[]> => {
    const data = (await rpcCall(RpcActions.guildWarnThresholdsList, {
      guildId,
      actorId,
    })) as { thresholds: WarnThresholdView[] };
    return data.thresholds;
  },
);

export const getGuildPanicState = cache(
  async (guildId: string, actorId: string): Promise<PanicStateView> => {
    const data = await rpcCall(RpcActions.guildPanicGet, {
      guildId,
      actorId,
    });
    return data as PanicStateView;
  },
);

export const getGuildBackups = cache(
  async (guildId: string, actorId: string): Promise<GuildBackupView[]> => {
    const data = (await rpcCall(RpcActions.guildBackupsList, {
      guildId,
      actorId,
    })) as { backups: GuildBackupView[] };
    return data.backups;
  },
);

export const getGuildVerificationPanel = cache(
  async (
    guildId: string,
    actorId: string,
  ): Promise<VerificationPanelView | null> => {
    const data = (await rpcCall(RpcActions.guildVerificationPanelGet, {
      guildId,
      actorId,
    })) as { panel: VerificationPanelView | null };
    return data.panel;
  },
);

export const getGuildTempVcGenerators = cache(
  async (guildId: string, actorId: string): Promise<TempVcGeneratorView[]> => {
    const data = (await rpcCall(RpcActions.guildTempVcGeneratorsList, {
      guildId,
      actorId,
    })) as { generators: TempVcGeneratorView[] };
    return data.generators;
  },
);

export const getGuildTempVcRecords = cache(
  async (guildId: string, actorId: string): Promise<TempVcRecordView[]> => {
    const data = (await rpcCall(RpcActions.guildTempVcRecordsList, {
      guildId,
      actorId,
    })) as { records: TempVcRecordView[] };
    return data.records;
  },
);

// Like `getGuildCases`, the filtered reads below take a fresh filter object each
// render, so wrapping them in `cache()` would memoize nothing.

export async function getGuildAuditLog(
  guildId: string,
  actorId: string,
  filter: AuditListPayload = {},
): Promise<AuditListData> {
  const data = await rpcCall(RpcActions.guildAuditList, {
    guildId,
    actorId,
    data: filter,
  });
  return data as AuditListData;
}

export async function getGuildConfigHistory(
  guildId: string,
  actorId: string,
  filter: ConfigHistoryListPayload = {},
): Promise<ConfigHistoryListData> {
  const data = await rpcCall(RpcActions.guildHistoryList, {
    guildId,
    actorId,
    data: filter,
  });
  return data as ConfigHistoryListData;
}

export async function getGuildOverrides(
  guildId: string,
  actorId: string,
  moduleName?: string,
): Promise<ConfigOverrideView[]> {
  const data = (await rpcCall(RpcActions.guildOverridesList, {
    guildId,
    actorId,
    data: { moduleName },
  })) as { overrides: ConfigOverrideView[] };
  return data.overrides;
}

export async function getGuildBlocklist(
  guildId: string,
  actorId: string,
  filter: BlocklistListPayload = {},
): Promise<BlocklistListData> {
  const data = await rpcCall(RpcActions.guildBlocklistList, {
    guildId,
    actorId,
    data: filter,
  });
  return data as BlocklistListData;
}

export async function getGuildModNotes(
  guildId: string,
  actorId: string,
  userId: string,
): Promise<ModNoteView[]> {
  const data = (await rpcCall(RpcActions.guildModNotesList, {
    guildId,
    actorId,
    data: { userId },
  })) as { notes: ModNoteView[] };
  return data.notes;
}

export async function getGuildAppeals(
  guildId: string,
  actorId: string,
  filter: AppealsListPayload = {},
): Promise<AppealsListData> {
  const data = await rpcCall(RpcActions.guildAppealsList, {
    guildId,
    actorId,
    data: filter,
  });
  return data as AppealsListData;
}

// Public, unauthenticated: no `actorId` - the RPC handler authorizes purely
// off the signed `token`, verified again server-side on every call.
export async function verifyAppealToken(
  guildId: string,
  caseId: number,
  token: string,
): Promise<AppealVerifyResult> {
  const data = await rpcCall(RpcActions.guildAppealsVerify, {
    guildId,
    data: { caseId, token },
  });
  return data as AppealVerifyResult;
}

export const getGuildAfkEntries = cache(
  async (guildId: string, actorId: string): Promise<AfkEntryView[]> => {
    const data = (await rpcCall(RpcActions.guildAfkList, {
      guildId,
      actorId,
    })) as { entries: AfkEntryView[] };
    return data.entries;
  },
);

export const getGuildIgnoredChannels = cache(
  async (guildId: string, actorId: string): Promise<IgnoredChannelView[]> => {
    const data = (await rpcCall(RpcActions.guildIgnoredList, {
      guildId,
      actorId,
    })) as { entries: IgnoredChannelView[] };
    return data.entries;
  },
);

export async function getGuildModuleData(
  guildId: string,
  actorId: string,
  filter: ModuleDataListPayload = {},
): Promise<ModuleDataListData> {
  const data = await rpcCall(RpcActions.guildModuleDataList, {
    guildId,
    actorId,
    data: filter,
  });
  return data as ModuleDataListData;
}

export const getSystemDashboard = cache(
  async (actorId: string): Promise<SystemDashboardData> => {
    const data = await rpcCall(RpcActions.systemDashboardGet, { actorId });
    return data as SystemDashboardData;
  },
);

export async function getSystemAuditLog(
  actorId: string,
  filter: SystemAuditListPayload = {},
): Promise<AuditListData> {
  const data = await rpcCall(RpcActions.systemAuditList, {
    actorId,
    data: filter,
  });
  return data as AuditListData;
}

export async function getSystemBlocklist(
  actorId: string,
  filter: BlocklistListPayload = {},
): Promise<BlocklistListData> {
  const data = await rpcCall(RpcActions.systemBlocklistList, {
    actorId,
    data: filter,
  });
  return data as BlocklistListData;
}

export const getSystemShards = cache(
  async (actorId: string): Promise<SystemShardsData> => {
    const data = await rpcCall(RpcActions.systemShardsGet, { actorId });
    return data as SystemShardsData;
  },
);
