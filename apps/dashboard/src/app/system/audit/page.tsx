import { ClipboardList } from "lucide-react";
import { requireBotOwner } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function SystemAuditPage() {
  await requireBotOwner();
  return (
    <StubPage
      icon={ClipboardList}
      title="System Audit Log"
      specComponent="SystemAuditStreamConsole"
      models={["AuditLedger (all guilds)"]}
      description="Searchable, all-guild admin-action feed for Bot Owners."
    />
  );
}
