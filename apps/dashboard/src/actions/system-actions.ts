"use server";

import { revalidatePath } from "next/cache";
import { RPC_ACTIONS, type GdprRequester } from "@lumi/contracts";
import { requireBotOwner } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import type { ActionResult } from "./guild-actions";

// dashboard.md §5: every action here re-checks `session.isBotOwner` — the
// "Bot Owner Privilege Escalation" mitigation — regardless of what route the
// caller reached the action from.

async function guardedSystemAction() {
  const session = await requireBotOwner();
  if (isRateLimited(`system-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function setMaintenanceMode(
  maintenanceMode: boolean,
  maintenanceMessage?: string,
): Promise<ActionResult> {
  try {
    const session = await guardedSystemAction();
    await rpcCall(RPC_ACTIONS.systemMaintenanceSet, {
      actorId: session.userId,
      data: { maintenanceMode, maintenanceMessage },
    });
    revalidatePath("/system");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}

export async function toggleGlobalModule(
  moduleName: string,
  enabled: boolean,
  reason?: string,
): Promise<ActionResult> {
  try {
    const session = await guardedSystemAction();
    await rpcCall(RPC_ACTIONS.systemModuleToggle, {
      actorId: session.userId,
      data: { moduleName, enabled, reason },
    });
    revalidatePath("/system/modules");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}

export async function addRepo(
  name: string,
  url: string,
  branch?: string,
): Promise<ActionResult> {
  try {
    const session = await guardedSystemAction();
    await rpcCall(RPC_ACTIONS.repoAdd, {
      actorId: session.userId,
      data: { name, url, branch },
    });
    revalidatePath("/system/addons");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}

export async function installModule(
  repoName: string,
  moduleName: string,
): Promise<ActionResult> {
  try {
    const session = await guardedSystemAction();
    await rpcCall(RPC_ACTIONS.moduleInstall, {
      actorId: session.userId,
      data: { repoName, moduleName },
    });
    revalidatePath("/system/addons");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}

export interface RepoModuleView {
  name: string;
  version?: string;
  isInstalled: boolean;
}

export async function listRepoModules(
  repoName: string,
): Promise<{ ok: true; modules: RepoModuleView[] } | { ok: false; error: string }> {
  try {
    const session = await guardedSystemAction();
    const result = (await rpcCall(RPC_ACTIONS.repoModules, {
      actorId: session.userId,
      data: { repoName },
    })) as { modules: RepoModuleView[] };
    return { ok: true, modules: result.modules };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}

export async function uninstallModule(moduleName: string): Promise<ActionResult> {
  try {
    const session = await guardedSystemAction();
    await rpcCall(RPC_ACTIONS.moduleUninstall, {
      actorId: session.userId,
      data: { moduleName },
    });
    revalidatePath("/system/addons");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}

export async function gdprDeleteUser(
  userId: string,
  requester: GdprRequester = "OWNER",
): Promise<ActionResult> {
  try {
    const session = await guardedSystemAction();
    await rpcCall(RPC_ACTIONS.gdprDelete, {
      actorId: session.userId,
      data: { userId, requester },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}
