import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function TempVcPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <div className="flex flex-col gap-6">
      <StubPage
        emoji="🔊"
        title="Temp VC Generators"
        specComponent="TempVcGeneratorsManager"
        models={["TempVcGenerator"]}
        description="Configure join-to-create channel templates (name pattern, user limit)."
      />
      <StubPage
        emoji="🎙️"
        title="Active Temp Voice Channels"
        specComponent="ActiveTempVcMonitorGrid"
        models={["TempVcRecord"]}
        description="Live voice channel state with lock/hide/kick admin overrides."
      />
    </div>
  );
}
