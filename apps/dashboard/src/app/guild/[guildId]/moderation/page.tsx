import { Gavel } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function ModerationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <StubPage
      icon={Gavel}
      title="Moderation Cases"
      specComponent="ModerationCaseManagerTable"
      models={["ModerationCase", "GuildCaseCounter"]}
      description="View, search, filter, and revoke moderation cases (bans, mutes, warns, kicks, quarantines)."
    />
  );
}
