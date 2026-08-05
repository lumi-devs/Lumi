import { Ban } from "lucide-react";
import { requireBotOwner } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function SystemBlocklistPage() {
  await requireBotOwner();
  return (
    <StubPage
      icon={Ban}
      title="Global Blocklist"
      specComponent="GlobalBlocklistTable"
      models={["Blocklist (guildId IS NULL)"]}
      description="Bot-wide ban list — these users are ignored in every guild."
    />
  );
}
