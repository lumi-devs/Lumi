import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard, getGuildPermits } from "#/lib/dashboard-fetch";
import { PermitsBoard } from "#/components/guild/permits-board";

export default async function PermitsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const [dashboard, permits] = await Promise.all([
    getGuildDashboard(guildId, session.userId),
    getGuildPermits(guildId, session.userId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-brand text-xl font-bold">Permits</h1>
        <p className="text-sm text-white/50">
          Named, reusable permission bundles, Wick-style. Enforced tiers are
          fixed and immune to anti-nuke quarantine; custom permits are fully
          editable and can be stripped.
        </p>
      </div>
      <PermitsBoard
        guildId={guildId}
        initialPermits={permits}
        roles={dashboard.roles}
        members={dashboard.members}
      />
    </div>
  );
}
