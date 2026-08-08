import type { Guild, User } from "discord.js";
import type { ModerationCase } from "@prisma/client";
import { getDashboardPublicUrl } from "#lib/env.js";
import { makeInfoCard } from "#lib/utilities/cards.js";
import { generateAppealToken } from "./token.js";

/**
 * DMs a signed appeal link for a just-created ban/timeout case. Silently
 * skipped (not an error) when `DASHBOARD_PUBLIC_URL` is unset - deployments
 * that haven't configured a public dashboard origin get no appeal link
 * rather than one pointing at `undefined`. Sent as a second DM (after the
 * action's own DM) since the case row - and so its id, which the token
 * embeds - only exists once the case has actually been created.
 */
export async function sendAppealLinkDm(
  targetUser: User,
  guild: Guild,
  moderationCase: ModerationCase,
): Promise<void> {
  const baseUrl = getDashboardPublicUrl();
  if (!baseUrl) return;

  const token = generateAppealToken({
    guildId: guild.id,
    caseId: moderationCase.id,
    userId: targetUser.id,
  });
  const link = `${baseUrl}/appeal/${guild.id}/${moderationCase.id}?token=${token}`;

  const dm = makeInfoCard(
    "Think this was a mistake?",
    `You can appeal this action in **${guild.name}** here:\n${link}`,
  );
  await targetUser.send(dm).catch(() => null);
}
