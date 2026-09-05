import { legacyRedirect, type LegacySearchParams } from "#/lib/legacy-redirect";

export default async function LegacyModuleConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; moduleName: string }>;
  searchParams: Promise<LegacySearchParams>;
}) {
  const { guildId, moduleName } = await params;
  legacyRedirect(
    `/guild/${guildId}/config/modules/${moduleName}`,
    await searchParams,
  );
}
