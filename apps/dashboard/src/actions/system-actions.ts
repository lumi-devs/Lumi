"use server";

import { revalidatePath } from "next/cache";
import { type GdprRequester, type RepoModuleView } from "@lumi/contracts";
import { requireBotOwner } from "#/lib/auth-guards";
import { rpc } from "#/lib/rpc";
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
    await rpc("system.maintenance.set", {
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
    await rpc("system.identity.set", {
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
    await rpc("system.module.toggle", {
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
    await rpc("system.module.clear", {
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
    await rpc("downloader.repo.add", {
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
    await rpc("downloader.module.install", {
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
    const result = await rpc("downloader.module.rollback", {
      actorId: session.userId,
      data: { moduleName, revision },
    });
    revalidatePath("/system/addons");
    return { ok: true, commit: result.commit };
  });
}

export async function listRepoModules(
  repoName: string,
): Promise<{ ok: true; modules: RepoModuleView[] } | { ok: false; error: string }> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    const result = await rpc("downloader.repo.modules", {
      actorId: session.userId,
      data: { repoName },
    });
    return { ok: true, modules: result.modules };
  });
}

export async function uninstallModule(moduleName: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSystemAction();
    await rpc("downloader.module.uninstall", {
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
    await rpc("global.gdpr.delete", {
      actorId: session.userId,
      data: { userId, requester },
    });
    return { ok: true };
  });
}
