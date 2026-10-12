import { authorize } from "#src/lib/api/permissions/Authorize.js";
import { memberRoleIds } from "#src/lib/api/permissions/Subject.js";

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
