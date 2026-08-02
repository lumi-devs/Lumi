import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <StubPage
      emoji="📋"
      title="Audit Log"
      specComponent="GuildAuditLogTable"
      models={["AuditLedger"]}
      description="Filtered guild admin-action feed with a red/green diff viewer."
    />
  );
}
