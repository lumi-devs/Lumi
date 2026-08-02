import { requireBotOwner } from "#/lib/auth-guards";
import { getSystemDashboard } from "#/lib/dashboard-fetch";
import { ModuleKillSwitchGrid } from "#/components/system/module-kill-switch-grid";

export default async function SystemModulesPage() {
  const session = await requireBotOwner();
  const data = await getSystemDashboard(session.userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-brand text-xl font-bold">Module Kill-Switches</h1>
        <p className="text-sm text-white/50">
          Force-disable any module across every guild instantly.
        </p>
      </div>
      <ModuleKillSwitchGrid moduleStates={data.moduleStates} />
    </div>
  );
}
