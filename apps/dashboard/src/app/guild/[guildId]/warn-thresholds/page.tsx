import { legacyRedirect, type LegacySearchParams } from "#/lib/legacy-redirect";

export default async function LegacyWarnThresholdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<LegacySearchParams>;
}) {
  const { guildId } = await params;
  legacyRedirect(`/guild/${guildId}/moderation/thresholds`, await searchParams);
}
