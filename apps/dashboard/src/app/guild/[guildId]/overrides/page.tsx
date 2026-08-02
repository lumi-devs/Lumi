import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function OverridesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <StubPage
      emoji="🎛️"
      title="Channel / Role Overrides"
      specComponent="ChannelRoleOverridesMatrix"
      models={["ModuleConfigOverride"]}
      description="Per-channel or per-role config exceptions to a module's guild-wide setting."
    />
  );
}
