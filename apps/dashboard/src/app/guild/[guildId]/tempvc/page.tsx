import { Mic, Volume2 } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";
import { PageHeader } from "#/components/ui/page-header";

export default async function TempVcPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Temp Voice Channels"
        description="Join-to-create generators, and the channels currently spawned from them."
      />
      <StubPage
        icon={Volume2}
        title="Temp VC Generators"
        specComponent="TempVcGeneratorsManager"
        models={["TempVcGenerator"]}
        description="Configure join-to-create channel templates (name pattern, user limit)."
      />
      <StubPage
        icon={Mic}
        title="Active Temp Voice Channels"
        specComponent="ActiveTempVcMonitorGrid"
        models={["TempVcRecord"]}
        description="Live voice channel state with lock/hide/kick admin overrides."
      />
    </div>
  );
}
