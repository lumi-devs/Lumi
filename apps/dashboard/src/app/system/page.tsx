import { requireBotOwner } from "#/lib/auth-guards";
import { getSystemDashboard } from "#/lib/dashboard-fetch";
import { StatsGrid } from "#/components/stats-grid";
import { MaintenanceForm } from "#/components/system/maintenance-form";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";

export default async function SystemPage() {
  const session = await requireBotOwner();
  const data = await getSystemDashboard(session.userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-brand text-xl font-bold">System Panel</h1>
        <p className="text-sm text-white/50">{data.global.botName} — global configuration</p>
      </div>

      <StatsGrid
        stats={[
          { emoji: "🏠", label: "Guilds", value: data.guildCount },
          { emoji: "🔌", label: "Overridden Modules", value: data.moduleStates.length },
          {
            emoji: data.global.maintenanceMode ? "🔴" : "🟢",
            label: "Status",
            value: data.global.maintenanceMode ? "Maintenance" : "Operational",
          },
          { emoji: "🔡", label: "Default Prefix", value: data.global.defaultPrefix },
        ]}
      />

      <MaintenanceForm
        maintenanceMode={data.global.maintenanceMode}
        maintenanceMessage={data.global.maintenanceMessage}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Bot identity</CardTitle>
            <CardDescription>Read-only — set via the Global Prisma model.</CardDescription>
          </div>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-white/40">Invite URL</dt>
            <dd className="truncate">{data.global.inviteUrl ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Support guild ID</dt>
            <dd className="font-mono">{data.global.supportGuildId ?? "—"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
