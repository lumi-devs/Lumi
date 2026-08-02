import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function PermitsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <div className="flex flex-col gap-6">
      <StubPage
        emoji="🪪"
        title="Enforced Permits"
        specComponent="EnforcedPermitsTable"
        models={["EnforcedPermit"]}
        description="Un-quarantinable system-level permits assigned to roles/users."
      />
      <StubPage
        emoji="🌳"
        title="Custom Permits"
        specComponent="CustomPermitsNodeTree"
        models={["CustomPermit"]}
        description="Fine-grained Wick-style node permits (mod.ban, tempvc.claim), stripped during Anti-Nuke Quarantine."
      />
    </div>
  );
}
