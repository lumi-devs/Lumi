import { IdCard, Network } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";
import { PageHeader } from "#/components/ui/page-header";

export default async function PermitsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Permits"
        description="Who is allowed to do what, independent of Discord's own role permissions."
      />
      <StubPage
        icon={IdCard}
        title="Enforced Permits"
        specComponent="EnforcedPermitsTable"
        models={["EnforcedPermit"]}
        description="Un-quarantinable system-level permits assigned to roles/users."
      />
      <StubPage
        icon={Network}
        title="Custom Permits"
        specComponent="CustomPermitsNodeTree"
        models={["CustomPermit"]}
        description="Fine-grained Wick-style node permits (mod.ban, tempvc.claim), stripped during Anti-Nuke Quarantine."
      />
    </div>
  );
}
