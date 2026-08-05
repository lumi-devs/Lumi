import { requireBotOwner } from "#/lib/auth-guards";
import { getSystemDashboard } from "#/lib/dashboard-fetch";
import { ModuleKillSwitchGrid } from "#/components/system/module-kill-switch-grid";
import { PageHeader } from "#/components/ui/page-header";

export default async function SystemModulesPage() {
  const session = await requireBotOwner();
  const data = await getSystemDashboard(session.userId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Module Kill-Switches"
        description="Force-disable any module across every guild instantly."
      />
      <ModuleKillSwitchGrid moduleStates={data.moduleStates} />
    </div>
  );
}
