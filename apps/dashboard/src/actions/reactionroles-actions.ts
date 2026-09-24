"use server";

import { revalidatePath } from "next/cache";
import type { RpcInput } from "@lumi/contracts/rpc";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

export async function setReactionRoleMenu(
  guildId: string,
  menu: RpcInput<"guild.reactionroles.menus.set">,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.reactionroles.menus.set", {
      guildId,
      actorId: session.userId,
      data: menu,
    });
    revalidatePath(`/guild/${guildId}/config/roles`);
    return { ok: true };
  });
}

export async function deleteReactionRoleMenu(
  guildId: string,
  id: string,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.reactionroles.menus.delete", {
      guildId,
      actorId: session.userId,
      data: { id },
    });
    revalidatePath(`/guild/${guildId}/config/roles`);
    return { ok: true };
  });
}
