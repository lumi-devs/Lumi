import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function WarnThresholdsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <StubPage
      emoji="⚠️"
      title="Warn Thresholds"
      specComponent="WarnThresholdRulesEditor"
      models={["WarnThreshold"]}
      description="Auto-escalation rules: e.g. 3 warns → mute, 5 warns → ban."
    />
  );
}
