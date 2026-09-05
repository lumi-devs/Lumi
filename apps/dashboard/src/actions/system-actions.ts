"use server";

import { revalidatePath } from "next/cache";
import { RpcActions, type GdprRequester } from "@lumi/contracts";
import { requireBotOwner } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction } from "#/lib/action-result";
import type { ActionResult } from "./guild-actions";

async function guardedSystemAction() {
  const session = await requireBotOwner();
  if (await isRateLimited(`system-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function setMaintenanceMode(
  maintenanceMode: boolean,
  maintenanceMessage?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpcCall(RpcActions.systemMaintenanceSet, {
      actorId: session.userId,
      data: { maintenanceMode, maintenanceMessage },
    });
    revalidatePath("/system");
    return { ok: true };
  });
}

export async function setBotIdentity(
  inviteUrl: string | null,
  supportGuildId: string | null,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpcCall(RpcActions.systemIdentitySet, {
      actorId: session.userId,
      data: { inviteUrl, supportGuildId },
    });
    revalidatePath("/system");
    return { ok: true };
  });
}

export async function toggleGlobalModule(
  moduleName: string,
  enabled: boolean,
  reason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpcCall(RpcActions.systemModuleToggle, {
      actorId: session.userId,
      data: { moduleName, enabled, reason },
    });
    revalidatePath("/system/modules");
    return { ok: true };
  });
}

export async function clearGlobalModule(moduleName: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpcCall(RpcActions.systemModuleClear, {
      actorId: session.userId,
      data: { moduleName },
    });
    revalidatePath("/system/modules");
    return { ok: true };
  });
}

export async function addRepo(
  name: string,
  url: string,
  branch?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpcCall(RpcActions.repoAdd, {
      actorId: session.userId,
      data: { name, url, branch },
    });
    revalidatePath("/system/addons");
    return { ok: true };
  });
}

export async function installModule(
  repoName: string,
  moduleName: string,
  revision?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpcCall(RpcActions.moduleInstall, {
      actorId: session.userId,
      data: { repoName, moduleName, revision },
    });
    revalidatePath("/system/addons");
    return { ok: true };
  });
}

export async function rollbackModule(
  moduleName: string,
  revision: string,
): Promise<{ ok: true; commit: string | null } | { ok: false; error: string }> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    const result = (await rpcCall(RpcActions.moduleRollback, {
      actorId: session.userId,
      data: { moduleName, revision },
    })) as { commit: string | null };
    revalidatePath("/system/addons");
    return { ok: true, commit: result.commit };
  });
}

export interface RepoModuleView {
  name: string;
  version?: string;
  short?: string;
  description?: string;
  author?: string[];
  end_user_data_statement?: string;
  isInstalled: boolean;
  commit: string | null;
  pinned: boolean;
}

export async function listRepoModules(
  repoName: string,
): Promise<{ ok: true; modules: RepoModuleView[] } | { ok: false; error: string }> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    const result = (await rpcCall(RpcActions.repoModules, {
      actorId: session.userId,
      data: { repoName },
    })) as { modules: RepoModuleView[] };
    return { ok: true, modules: result.modules };
  });
}

export async function uninstallModule(moduleName: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpcCall(RpcActions.moduleUninstall, {
      actorId: session.userId,
      data: { moduleName },
    });
    revalidatePath("/system/addons");
    return { ok: true };
  });
}

export async function gdprDeleteUser(
  userId: string,
  requester: GdprRequester = "OWNER",
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpcCall(RpcActions.gdprDelete, {
      actorId: session.userId,
      data: { userId, requester },
    });
    return { ok: true };
  });
}
