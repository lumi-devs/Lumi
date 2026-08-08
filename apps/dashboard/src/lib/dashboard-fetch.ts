import "server-only";
import { cache } from "react";
import { RPC_ACTIONS } from "@lumi/contracts";
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
  ModuleDataListPayload,
  SystemAuditListPayload,
} from "@lumi/contracts";

export const getGuildDashboard = cache(
  async (guildId: string, actorId: string): Promise<DashboardData> => {
    const data = await rpcCall(RPC_ACTIONS.guildDashboardGet, {
      guildId,
      actorId,
    });
    return data as DashboardData;
  },
);

export const getGuildPermits = cache(
  async (guildId: string, actorId: string): Promise<PermitView[]> => {
    const data = (await rpcCall(RPC_ACTIONS.guildPermitsList, {
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
  const data = await rpcCall(RPC_ACTIONS.guildCasesList, {
    guildId,
    actorId,
    data: filter,
  });
  return data as CasesListData;
}

export const getGuildWarnThresholds = cache(
  async (guildId: string, actorId: string): Promise<WarnThresholdView[]> => {
    const data = (await rpcCall(RPC_ACTIONS.guildWarnThresholdsList, {
      guildId,
      actorId,
    })) as { thresholds: WarnThresholdView[] };
    return data.thresholds;
  },
);

export const getGuildPanicState = cache(
  async (guildId: string, actorId: string): Promise<PanicStateView> => {
    const data = await rpcCall(RPC_ACTIONS.guildPanicGet, {
      guildId,
      actorId,
    });
    return data as PanicStateView;
  },
);

export const getGuildVerificationPanel = cache(
  async (
    guildId: string,
    actorId: string,
  ): Promise<VerificationPanelView | null> => {
    const data = (await rpcCall(RPC_ACTIONS.guildVerificationPanelGet, {
      guildId,
      actorId,
    })) as { panel: VerificationPanelView | null };
    return data.panel;
  },
);

export const getGuildTempVcGenerators = cache(
  async (guildId: string, actorId: string): Promise<TempVcGeneratorView[]> => {
    const data = (await rpcCall(RPC_ACTIONS.guildTempVcGeneratorsList, {
      guildId,
      actorId,
    })) as { generators: TempVcGeneratorView[] };
    return data.generators;
  },
);

export const getGuildTempVcRecords = cache(
  async (guildId: string, actorId: string): Promise<TempVcRecordView[]> => {
    const data = (await rpcCall(RPC_ACTIONS.guildTempVcRecordsList, {
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
  const data = await rpcCall(RPC_ACTIONS.guildAuditList, {
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
  const data = await rpcCall(RPC_ACTIONS.guildHistoryList, {
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
  const data = (await rpcCall(RPC_ACTIONS.guildOverridesList, {
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
  const data = await rpcCall(RPC_ACTIONS.guildBlocklistList, {
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
  const data = (await rpcCall(RPC_ACTIONS.guildModNotesList, {
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
  const data = await rpcCall(RPC_ACTIONS.guildAppealsList, {
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
  const data = await rpcCall(RPC_ACTIONS.guildAppealsVerify, {
    guildId,
    data: { caseId, token },
  });
  return data as AppealVerifyResult;
}

export const getGuildAfkEntries = cache(
  async (guildId: string, actorId: string): Promise<AfkEntryView[]> => {
    const data = (await rpcCall(RPC_ACTIONS.guildAfkList, {
      guildId,
      actorId,
    })) as { entries: AfkEntryView[] };
    return data.entries;
  },
);

export const getGuildIgnoredChannels = cache(
  async (guildId: string, actorId: string): Promise<IgnoredChannelView[]> => {
    const data = (await rpcCall(RPC_ACTIONS.guildIgnoredList, {
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
  const data = await rpcCall(RPC_ACTIONS.guildModuleDataList, {
    guildId,
    actorId,
    data: filter,
  });
  return data as ModuleDataListData;
}

export const getSystemDashboard = cache(
  async (actorId: string): Promise<SystemDashboardData> => {
    const data = await rpcCall(RPC_ACTIONS.systemDashboardGet, { actorId });
    return data as SystemDashboardData;
  },
);

export async function getSystemAuditLog(
  actorId: string,
  filter: SystemAuditListPayload = {},
): Promise<AuditListData> {
  const data = await rpcCall(RPC_ACTIONS.systemAuditList, {
    actorId,
    data: filter,
  });
  return data as AuditListData;
}

export async function getSystemBlocklist(
  actorId: string,
  filter: BlocklistListPayload = {},
): Promise<BlocklistListData> {
  const data = await rpcCall(RPC_ACTIONS.systemBlocklistList, {
    actorId,
    data: filter,
  });
  return data as BlocklistListData;
}

export const getSystemShards = cache(
  async (actorId: string): Promise<SystemShardsData> => {
    const data = await rpcCall(RPC_ACTIONS.systemShardsGet, { actorId });
    return data as SystemShardsData;
  },
);
