import "server-only";

// Small Discord REST/CDN helpers shared by the NextAuth callbacks and the
// server components that render user/guild chrome. Token exchange itself is
// handled by NextAuth's built-in Discord OAuth2 provider (see lib/auth.ts) —
// this module only covers what NextAuth doesn't: fetching the caller's guild
// list (needs the `guilds` scope) and CDN URL formatting.

const DISCORD_API = "https://discord.com/api/v10";
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

/** Fetch the guilds the authenticated user belongs to, using their OAuth2 access token. */
export async function fetchUserGuilds(
  accessToken: string,
): Promise<OAuthGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Guild membership changes frequently enough that caching would show
    // stale "you can manage this server" state after a permission change.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Discord guilds fetch failed: ${res.status}`);
  return (await res.json()) as OAuthGuild[];
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
