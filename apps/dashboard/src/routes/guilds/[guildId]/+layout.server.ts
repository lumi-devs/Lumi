import type { LayoutServerLoad } from "./$types";
import { requireGuildAccess } from "$lib/server/auth";
import { guildIconUrl } from "$lib/server/discord";
import { getPrisma } from "$lib/server/prisma";

export const load: LayoutServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  const access = await requireGuildAccess(event, guildId);
  const record = await getPrisma().guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      name: true,
      icon: true,
      ownerId: true,
      joinedAt: true,
      leftAt: true,
    },
  });

  return {
    guild: {
      id: guildId,
      name: record?.name || access.name,
      iconUrl: guildIconUrl(guildId, record?.icon ?? access.icon),
      owner: access.owner,
      joinedAt: record?.joinedAt?.toISOString() ?? null,
      leftAt: record?.leftAt?.toISOString() ?? null,
      known: Boolean(record),
    },
  };
};
