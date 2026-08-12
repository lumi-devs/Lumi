// Pure Discord CDN URL / permission-bit helpers — no secrets, no fetch, so
// unlike lib/discord.ts (which touches OAuth access tokens and is marked
// `server-only`) this is safe to import from Client Components too.

const DISCORD_CDN = "https://cdn.discordapp.com";
const MANAGE_GUILD = 0x20n;

export interface OAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
  owner?: boolean;
}

/** True when the OAuth guild entry grants Manage Server (or ownership). */
export function canManage(guild: OAuthGuild): boolean {
  if (guild.owner) return true;
  try {
    return (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

export function userAvatarUrl(
  userId: string,
  avatar: string | null | undefined,
): string {
  if (avatar) {
    const ext = avatar.startsWith("a_") ? "gif" : "png";
    return `${DISCORD_CDN}/avatars/${userId}/${avatar}.${ext}?size=64`;
  }
  const index = Number((BigInt(userId) >> 22n) % 6n);
  return `${DISCORD_CDN}/embed/avatars/${index}.png`;
}

export function guildIconUrl(id: string, icon: string | null): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `${DISCORD_CDN}/icons/${id}/${icon}.${ext}?size=64`;
}
