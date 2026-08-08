"use server";

import { revalidatePath } from "next/cache";
import {
  RPC_ACTIONS,
  type GuildSettingsPayload,
  type GuildSetupRunResult,
  type PermitKind,
  type PermitTargetType,
} from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

// Server Actions are the Next.js replacement for the old server.ts
// `/api/guild/:guildId/*` POST routes. Two defenses carry over unchanged
// from dashboard.md §5:
//  - IDOR guard: `requireGuild()` re-checks Manage Server on *every* call,
//    server-side, regardless of what the client believes it's allowed to do.
//  - CSRF: Server Actions already reject cross-origin POSTs via Next's
//    built-in Origin/Host check — see next.config.ts's comment. No hand-rolled
//    token here.
// Rate limiting (§5F) is layered on top, keyed by session user id (more
// meaningful than IP for an authenticated mutation).

async function guardedAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export type { ActionResult };

export async function toggleGuildModule(
  guildId: string,
  moduleName: string,
  enabled: boolean,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RPC_ACTIONS.guildModuleToggle, {
      guildId,
      actorId: session.userId,
      data: { moduleName, enabled },
    });
    revalidatePath(`/guild/${guildId}`);
    return { ok: true };
  });
}

export async function setGuildConfigField(
  guildId: string,
  moduleName: string,
  key: string,
  value: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RPC_ACTIONS.guildConfigSet, {
      guildId,
      actorId: session.userId,
      data: { moduleName, key, value },
    });
    revalidatePath(`/guild/${guildId}/modules/${moduleName}`);
    return { ok: true };
  });
}

export async function runGuildSetup(
  guildId: string,
): Promise<ActionResult & { result?: GuildSetupRunResult }> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    const result = (await rpcCall(RPC_ACTIONS.guildSetupRun, {
      guildId,
      actorId: session.userId,
    })) as GuildSetupRunResult;
    revalidatePath(`/guild/${guildId}`);
    revalidatePath(`/guild/${guildId}/modules/security`);
    revalidatePath(`/guild/${guildId}/modules/mod`);
    revalidatePath(`/guild/${guildId}/setup`);
    return { ok: true, result };
  });
}

export async function setGuildSettings(
  guildId: string,
  data: GuildSettingsPayload,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RPC_ACTIONS.guildSettingsSet, {
      guildId,
      actorId: session.userId,
      data,
    });
    revalidatePath(`/guild/${guildId}`);
    return { ok: true };
  });
}

export async function createPermit(
  guildId: string,
  name: string,
  kind: PermitKind,
  nodes: string[],
): Promise<ActionResult & { permitId?: number }> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    const res = (await rpcCall(RPC_ACTIONS.guildPermitsCreate, {
      guildId,
      actorId: session.userId,
      data: { name, kind, nodes },
    })) as { permit: { id: number } };
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true, permitId: res.permit.id };
  });
}

export async function updatePermit(
  guildId: string,
  permitId: number,
  data: { name?: string; nodes?: string[] },
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RPC_ACTIONS.guildPermitsUpdate, {
      guildId,
      actorId: session.userId,
      data: { permitId, ...data },
    });
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true };
  });
}

export async function deletePermit(
  guildId: string,
  permitId: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RPC_ACTIONS.guildPermitsDelete, {
      guildId,
      actorId: session.userId,
      data: { permitId },
    });
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true };
  });
}

export async function assignPermit(
  guildId: string,
  permitId: number,
  targetType: PermitTargetType,
  targetId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RPC_ACTIONS.guildPermitsAssign, {
      guildId,
      actorId: session.userId,
      data: { permitId, targetType, targetId },
    });
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true };
  });
}

export async function unassignPermit(
  guildId: string,
  permitId: number,
  targetType: PermitTargetType,
  targetId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RPC_ACTIONS.guildPermitsUnassign, {
      guildId,
      actorId: session.userId,
      data: { permitId, targetType, targetId },
    });
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true };
  });
}

