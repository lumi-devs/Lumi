import type { DashboardModuleView } from "#/lib/dashboard-data";

export interface SetupIssue {
  id: string;
  title: string;
  detail: string;
}

export function buildSetupIssues(modules: DashboardModuleView[]): SetupIssue[] {
  const security =
    modules.find((m) => m.name === "security")?.config ?? {};
  const mod = modules.find((m) => m.name === "mod")?.config ?? {};
  const issues: SetupIssue[] = [];

  if (!security["log_channel_id"]) {
    issues.push({
      id: "security-log-channel",
      title: "Security log channel is not set",
      detail: "Anti-nuke and join-gate alerts have nowhere to post.",
    });
  }
  if (!mod["log_channel_id"]) {
    issues.push({
      id: "mod-log-channel",
      title: "Mod log channel is not set",
      detail: "Warn, mute, and ban case embeds have nowhere to post.",
    });
  }
  if (!mod["quarantine_role_id"]) {
    issues.push({
      id: "quarantine-role",
      title: "Quarantine role is not set",
      detail: "Anti-nuke responses and timeouts have no role to assign.",
    });
  }
  if (security["antinuke_enabled"] !== true) {
    issues.push({
      id: "antinuke-enabled",
      title: "Anti-nuke is off",
      detail: "Mass bans, kicks, or deletions trigger no automatic response.",
    });
  }
  if (security["joingate_enabled"] !== true) {
    issues.push({
      id: "joingate-enabled",
      title: "Join gate is off",
      detail: "New members join without raid or throwaway-account screening.",
    });
  }
  if (security["verification_enabled"] !== true) {
    issues.push({
      id: "verification-enabled",
      title: "Verification is off",
      detail: "Members are not required to verify before participating.",
    });
  }
  return issues;
}
