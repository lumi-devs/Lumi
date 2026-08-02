import "server-only";
import { cache } from "react";
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcCall } from "./rpc";
import type { DashboardData, SystemDashboardData } from "./dashboard-data";

// `React.cache()` gives per-request memoization: the guild layout (sidebar)
// and whichever page is rendering both call this with the same guildId, but
// only one `guild.dashboard.get` RPC round-trip happens per request instead
// of one per component. Same pattern commonly used for a Prisma/data-layer
// singleton fetch in Next.js Server Components.

export const getGuildDashboard = cache(
  async (guildId: string, actorId: string): Promise<DashboardData> => {
    const data = await rpcCall(RPC_ACTIONS.guildDashboardGet, {
      guildId,
      actorId,
    });
    return data as DashboardData;
  },
);

export const getSystemDashboard = cache(
  async (actorId: string): Promise<SystemDashboardData> => {
    const data = await rpcCall(RPC_ACTIONS.systemDashboardGet, { actorId });
    return data as SystemDashboardData;
  },
);
