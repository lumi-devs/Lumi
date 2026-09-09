import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

/**
 * Where Discord sends the user after a bot invite, when
 * `DASHBOARD_INVITE_REDIRECT` is on. Discord appends `guild_id` (and a `code`
 * we have no use for — the bot is already in the guild by this point), so this
 * only has to put the user back on the server they just invited to.
 */
export function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get("guild_id");
  redirect(guildId && /^\d{17,20}$/.test(guildId) ? `/guild/${guildId}` : "/guilds");
}
