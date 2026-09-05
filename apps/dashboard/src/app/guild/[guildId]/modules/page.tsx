import { legacyRedirect, type LegacySearchParams } from "#/lib/legacy-redirect";

export default async function LegacyModulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<LegacySearchParams>;
}) {
  const { guildId } = await params;
  legacyRedirect(`/guild/${guildId}/config/modules`, await searchParams);
}
