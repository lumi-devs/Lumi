import type { Guild, User } from "discord.js";
import type { ModerationCase } from "@prisma/client";
import { getDashboardPublicUrl } from "#src/lib/Env.js";
import { makeInfoCard } from "#src/lib/ui/Cards.js";
import { generateAppealToken } from "#src/modules/mod/services/AppealToken.js";

export async function sendAppealLinkDm(
  targetUser: User,
  guild: Guild,
  moderationCase: ModerationCase,
): Promise<void> {
  const baseUrl = getDashboardPublicUrl();
  if (!baseUrl || !targetUser) return;

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
