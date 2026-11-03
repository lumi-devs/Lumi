import { manageableGuilds, requireSession } from "$lib/server/auth";
import { guildIconUrl } from "$lib/server/discord";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const guilds = await manageableGuilds(event);
  return {
    guilds: guilds
      .map((guild) => ({
        ...guild,
        iconUrl: guildIconUrl(guild.id, guild.icon),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
};
