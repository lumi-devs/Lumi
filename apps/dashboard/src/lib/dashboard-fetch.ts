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
  LogClaimView,
  ModNoteView,
  ModuleDataListData,
  PanicStateView,
  PermitView,
  ReactionRoleMenuView,
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
  GuildChannelListItem,
  GuildRoleListItem,
  GuildSummaryView,
  ModuleDataListPayload,
  SystemAuditListPayload,
} from "@lumi/contracts";

export const getGuildDashboard = cache(
  async (guildId: string, actorId: string): Promise<DashboardData> => {
    return rpcCall(RpcActions.guildDashboardGet, {
      guildId,
      actorId,
    });
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
    const data = await rpcCall(RpcActions.guildSummariesList, {
      actorId,
      data: { guildIds },
    });
    return data.summaries;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) throw err;
    return [];
  }
}
export const getGuildPermits = cache(
  async (guildId: string, actorId: string): Promise<PermitView[]> => {
    const data = await rpcCall(RpcActions.guildPermitsList, {
      guildId,
      actorId,
    });
    return data.permits;
  },
);

export const getGuildRoles = cache(
  async (guildId: string, actorId: string): Promise<GuildRoleListItem[]> => {
    const data = await rpcCall(RpcActions.guildRolesList, {
      guildId,
      actorId,
    });
    return data.roles;
  },
);

export const getGuildChannels = cache(
  async (
    guildId: string,
    actorId: string,
  ): Promise<GuildChannelListItem[]> => {
    const data = await rpcCall(RpcActions.guildChannelsList, {
      guildId,
      actorId,
    });
    return data.channels;
  },
);

// Not `cache()`-wrapped: the filter is a fresh object per render, and
// React.cache keys arguments by identity, so memoization would never hit.
export async function getGuildCases(
  guildId: string,
  actorId: string,
  filter: CasesListPayload = {},
): Promise<CasesListData> {
  return rpcCall(RpcActions.guildCasesList, {
    guildId,
    actorId,
    data: filter,
  });
}

export const getGuildWarnThresholds = cache(
  async (guildId: string, actorId: string): Promise<WarnThresholdView[]> => {
    const data = await rpcCall(RpcActions.guildWarnThresholdsList, {
      guildId,
      actorId,
    });
    return data.thresholds;
  },
);

export const getGuildPanicState = cache(
  async (guildId: string, actorId: string): Promise<PanicStateView> => {
    return rpcCall(RpcActions.guildPanicGet, {
      guildId,
      actorId,
    });
  },
);

export const getGuildBackups = cache(
  async (guildId: string, actorId: string): Promise<GuildBackupView[]> => {
    const data = await rpcCall(RpcActions.guildBackupsList, {
      guildId,
      actorId,
    });
    return data.backups;
  },
);

export const getGuildVerificationPanel = cache(
  async (
    guildId: string,
    actorId: string,
  ): Promise<VerificationPanelView | null> => {
    const data = await rpcCall(RpcActions.guildVerificationPanelGet, {
      guildId,
      actorId,
    });
    return data.panel;
  },
);

export const getGuildLogClaims = cache(
  async (guildId: string, actorId: string): Promise<LogClaimView[]> => {
    const data = await rpcCall(RpcActions.guildLogClaimsList, {
      guildId,
      actorId,
    });
    return data.claims;
  },
);

export const getGuildTempVcGenerators = cache(
  async (guildId: string, actorId: string): Promise<TempVcGeneratorView[]> => {
    const data = await rpcCall(RpcActions.guildTempVcGeneratorsList, {
      guildId,
      actorId,
    });
    return data.generators;
  },
);

export const getGuildTempVcRecords = cache(
  async (guildId: string, actorId: string): Promise<TempVcRecordView[]> => {
    const data = await rpcCall(RpcActions.guildTempVcRecordsList, {
      guildId,
      actorId,
    });
    return data.records;
  },
);

export const getGuildReactionRoleMenus = cache(
  async (guildId: string, actorId: string): Promise<ReactionRoleMenuView[]> => {
    const data = await rpcCall(RpcActions.guildReactionRoleMenusList, {
      guildId,
      actorId,
    });
    return data.menus;
  },
);

// Like `getGuildCases`, the filtered reads below take a fresh filter object each
// render, so wrapping them in `cache()` would memoize nothing.

export async function getGuildAuditLog(
  guildId: string,
  actorId: string,
  filter: AuditListPayload = {},
): Promise<AuditListData> {
  return rpcCall(RpcActions.guildAuditList, {
    guildId,
    actorId,
    data: filter,
  });
}

export async function getGuildConfigHistory(
  guildId: string,
  actorId: string,
  filter: ConfigHistoryListPayload = {},
): Promise<ConfigHistoryListData> {
  return rpcCall(RpcActions.guildHistoryList, {
    guildId,
    actorId,
    data: filter,
  });
}

export async function getGuildOverrides(
  guildId: string,
  actorId: string,
  moduleName?: string,
): Promise<ConfigOverrideView[]> {
  const data = await rpcCall(RpcActions.guildOverridesList, {
    guildId,
    actorId,
    ...(moduleName === undefined ? {} : { data: { moduleName } }),
  });
  return data.overrides;
}

export async function getGuildBlocklist(
  guildId: string,
  actorId: string,
  filter: BlocklistListPayload = {},
): Promise<BlocklistListData> {
  return rpcCall(RpcActions.guildBlocklistList, {
    guildId,
    actorId,
    data: filter,
  });
}

export async function getGuildModNotes(
  guildId: string,
  actorId: string,
  userId: string,
): Promise<ModNoteView[]> {
  const data = await rpcCall(RpcActions.guildModNotesList, {
    guildId,
    actorId,
    data: { userId },
  });
  return data.notes;
}

export async function getGuildAppeals(
  guildId: string,
  actorId: string,
  filter: AppealsListPayload = {},
): Promise<AppealsListData> {
  return rpcCall(RpcActions.guildAppealsList, {
    guildId,
    actorId,
    data: filter,
  });
}

// Public, unauthenticated: no `actorId` - the RPC handler authorizes purely
// off the signed `token`, verified again server-side on every call.
export async function verifyAppealToken(
  guildId: string,
  caseId: number,
  token: string,
): Promise<AppealVerifyResult> {
  return rpcCall(RpcActions.guildAppealsVerify, {
    guildId,
    data: { caseId, token },
  });
}

export const getGuildAfkEntries = cache(
  async (guildId: string, actorId: string): Promise<AfkEntryView[]> => {
    const data = await rpcCall(RpcActions.guildAfkList, {
      guildId,
      actorId,
    });
    return data.entries;
  },
);

export const getGuildIgnoredChannels = cache(
  async (guildId: string, actorId: string): Promise<IgnoredChannelView[]> => {
    const data = await rpcCall(RpcActions.guildIgnoredList, {
      guildId,
      actorId,
    });
    return data.entries;
  },
);

export async function getGuildModuleData(
  guildId: string,
  actorId: string,
  filter: ModuleDataListPayload = {},
): Promise<ModuleDataListData> {
  return rpcCall(RpcActions.guildModuleDataList, {
    guildId,
    actorId,
    data: filter,
  });
}

export const getSystemDashboard = cache(
  async (actorId: string): Promise<SystemDashboardData> => {
    return rpcCall(RpcActions.systemDashboardGet, { actorId });
  },
);

export async function getSystemAuditLog(
  actorId: string,
  filter: SystemAuditListPayload = {},
): Promise<AuditListData> {
  return rpcCall(RpcActions.systemAuditList, {
    actorId,
    data: filter,
  });
}

export async function getSystemBlocklist(
  actorId: string,
  filter: BlocklistListPayload = {},
): Promise<BlocklistListData> {
  return rpcCall(RpcActions.systemBlocklistList, {
    actorId,
    data: filter,
  });
}

export const getSystemShards = cache(
  async (actorId: string): Promise<SystemShardsData> => {
    return rpcCall(RpcActions.systemShardsGet, { actorId });
  },
);
