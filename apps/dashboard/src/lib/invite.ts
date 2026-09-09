const AuthorizeUrl = "https://discord.com/oauth2/authorize";

export function inviteUrlFor(
  clientId: string,
  guildId: string,
  returnTo?: string,
): string {
  const url = new URL(AuthorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("permissions", "8");
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("guild_id", guildId);
  url.searchParams.set("disable_guild_select", "true");
  if (returnTo) {
    // Both are required together: Discord ignores redirect_uri without a
    // response_type, and rejects the request outright if the URI is not
    // registered on the application.
    url.searchParams.set("redirect_uri", returnTo);
    url.searchParams.set("response_type", "code");
  }
  return url.toString();
}

/** The registered return URL, or undefined when the operator has not set one. */
export function inviteReturnToFrom(publicUrl: string): string | undefined {
  return publicUrl ? `${publicUrl.replace(/\/+$/, "")}/oauth/guild` : undefined;
}
