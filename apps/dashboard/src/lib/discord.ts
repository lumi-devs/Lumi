import "server-only";

// Small Discord REST helpers shared by the NextAuth callbacks and the
// server components that render user/guild chrome. Token exchange itself is
// handled by NextAuth's built-in Discord OAuth2 provider (see lib/auth.ts) —
// this module only covers what NextAuth doesn't: fetching the caller's guild
// list (needs the `guilds` scope). Pure formatting helpers (no secrets, no
// fetch) live in lib/discord-format.ts instead, re-exported here so existing
// server-side importers don't need to change - that split exists so Client
// Components (e.g. GuildPicker) can use the CDN URL helpers without pulling
// in this file's `server-only` marker.

const DiscordApi = "https://discord.com/api/v10";

export type { OAuthGuild } from "./discord-format";
export { canManage, userAvatarUrl, guildIconUrl } from "./discord-format";
import type { OAuthGuild } from "./discord-format";

/**
 * Carries the HTTP status so callers can tell "this grant is gone" (401/403,
 * `invalid_grant`) from "Discord is having a moment" (429/5xx/network) — the
 * two need opposite handling when re-checking a live session.
 */
export class DiscordApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly body: string = "",
  ) {
    super(message);
    this.name = "DiscordApiError";
  }

  /** The user's authorization no longer exists: revoked, expired, or reset. */
  public get isAuthFailure(): boolean {
    if (this.status === 401 || this.status === 403) return true;
    return this.status === 400 && this.body.includes("invalid_grant");
  }
}

/** Fetch the guilds the authenticated user belongs to, using their OAuth2 access token. */
export async function fetchUserGuilds(
  accessToken: string,
): Promise<OAuthGuild[]> {
  const res = await fetch(`${DiscordApi}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Guild membership changes frequently enough that caching would show
    // stale "you can manage this server" state after a permission change.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DiscordApiError(
      `Discord guilds fetch failed: ${res.status}`,
      res.status,
      body,
    );
  }
  return (await res.json()) as OAuthGuild[];
}
