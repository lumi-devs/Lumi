import "../preconditions/LumiPermissionPrecondition.js";
import "./preconditions/Administrator.js";
import "./preconditions/BotOwner.js";
import "./preconditions/GuildOwner.js";
import "./preconditions/MaintenanceMode.js";
import "./preconditions/Moderator.js";
import "./preconditions/ModuleEnabled.js";
import "./preconditions/NotBlocked.js";
import "./preconditions/NotIgnored.js";
import { authorize } from "./authorize.js";
import { memberRoleIds } from "./subject.js";

export * from "./PermitResolver.js";
export * from "./authorize.js";

/**
 * Granular permit-node check for interaction handlers, which (unlike
 * Command pieces) never run through LumiPermissionPrecondition. Mirrors
 * that precondition's guild/user/role extraction against `target`.
 */
export async function hasRequiredPermit(
  target: unknown,
  permitNode: string,
): Promise<boolean> {
  if (!target || typeof target !== "object") return false;
  const t = target as Record<string, unknown>;
  const userId =
    (t.user as { id?: string })?.id ??
    (t.author as { id?: string })?.id ??
    (t.userId as string);
  const guildId = (t.guildId as string | null) ?? (t.guild as { id?: string })?.id;
  if (!userId || !guildId) return false;

  const guild = (t.guild as { ownerId?: string }) ?? null;
  const channelId = t.channelId as string | undefined;
  return authorize(
    {
      userId,
      guildId,
      roleIds: memberRoleIds(t.member),
      channelId,
      guildOwnerId: guild?.ownerId ?? "",
    },
    { kind: "permit", node: permitNode },
  );
}
