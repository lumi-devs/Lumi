import { History } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <StubPage
      icon={History}
      title="Settings History & Rollback"
      specComponent="SettingsHistoryRollbackTable"
      models={["ModuleConfigHistory"]}
      description="Full change log for every config write, with one-click rollback."
    />
  );
}
