import { Shield } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildEntities } from "#/lib/guild-reads";
import { rpc } from "#/lib/rpc";
import { PermitsBoard } from "#/components/guild/permits-board";
import { PageHeader } from "#/components/ui/page-header";

export default async function PermitsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const [entities, permits] = await Promise.all([
    getGuildEntities(guildId, session.userId),
    rpc("guild.permits.list", {
      guildId,
      actorId: session.userId,
    }).then((r) => r.permits),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Shield}
        title="Permits"
        description="Named, reusable permission bundles, Wick-style. Enforced tiers are fixed and immune to anti-nuke quarantine; custom permits are fully editable and can be stripped."
      />
      <PermitsBoard
        guildId={guildId}
        initialPermits={permits}
        roles={entities.roles}
        members={entities.members}
      />
    </div>
  );
}
