import { Activity, Server, Terminal, Power } from "lucide-react";
import { requireBotOwner } from "#/lib/auth-guards";
import { getSystemDashboard } from "#/lib/dashboard-fetch";
import { StatsGrid } from "#/components/stats-grid";
import { MaintenanceForm } from "#/components/system/maintenance-form";
import { PageHeader } from "#/components/ui/page-header";
import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card";

export default async function SystemPage() {
  const session = await requireBotOwner();
  const data = await getSystemDashboard(session.userId);

  return (
    // Same three-beat page-load choreography as the guild overview.
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="System Panel"
          description={`Bot-wide configuration for ${data.global.botName}. Changes here apply to every guild immediately.`}
          actions={
            <Badge
              variant={data.global.maintenanceMode ? "warning" : "success"}
              dot
            >
              {data.global.maintenanceMode ? "Maintenance" : "Operational"}
            </Badge>
          }
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <StatsGrid
          stats={[
            { icon: Server, label: "Guilds", value: data.guildCount },
            {
              icon: Power,
              label: "Overridden modules",
              value: data.moduleStates.length,
            },
            {
              icon: Activity,
              label: "Status",
              value: data.global.maintenanceMode ? "Maintenance" : "Operational",
              tone: data.global.maintenanceMode ? "warning" : "success",
            },
            {
              icon: Terminal,
              label: "Default prefix",
              value: data.global.defaultPrefix,
            },
          ]}
        />
      </div>

      <div
        className="rise flex flex-col gap-4"
        style={{ "--rise-delay": "140ms" } as React.CSSProperties}
      >
        <MaintenanceForm
          maintenanceMode={data.global.maintenanceMode}
          maintenanceMessage={data.global.maintenanceMessage}
        />

        <Card>
          <CardHeader actions={<Badge variant="outline">Read-only</Badge>}>
            <CardTitle>Bot identity</CardTitle>
            <CardDescription>
              Set on the Global Prisma model, not editable from the dashboard.
            </CardDescription>
          </CardHeader>
          <CardBody className="p-0">
            <dl className="divide-y divide-border">
              <div className="flex items-baseline gap-4 px-4 py-2.5">
                <dt className="w-40 shrink-0 text-[12px] text-fg-muted">
                  Invite URL
                </dt>
                <dd className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
                  {data.global.inviteUrl ?? (
                    <span className="font-sans text-fg-subtle">Not set</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline gap-4 px-4 py-2.5">
                <dt className="w-40 shrink-0 text-[12px] text-fg-muted">
                  Support guild ID
                </dt>
                <dd className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
                  {data.global.supportGuildId ?? (
                    <span className="font-sans text-fg-subtle">Not set</span>
                  )}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
