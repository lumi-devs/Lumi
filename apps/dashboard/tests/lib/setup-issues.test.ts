import { describe, it, expect } from "bun:test";
import { buildSetupIssues } from "#/components/guild/setup-issues";
import type { DashboardModuleView } from "#/lib/dashboard-data";

function modules(
  security: Record<string, unknown>,
  mod: Record<string, unknown>,
): DashboardModuleView[] {
  return [
    { name: "security", config: security } as DashboardModuleView,
    { name: "mod", config: mod } as DashboardModuleView,
  ];
}

describe("buildSetupIssues", () => {
  it("reports every gap for a fresh server", () => {
    const issues = buildSetupIssues(modules({}, {}));
    expect(issues.map((i) => i.id)).toEqual([
      "security-log-channel",
      "mod-log-channel",
      "quarantine-role",
      "antinuke-enabled",
      "joingate-enabled",
      "verification-enabled",
    ]);
  });

  it("reports nothing once the baseline is configured", () => {
    const issues = buildSetupIssues(
      modules(
        {
          log_channel_id: "chan-1",
          antinuke_enabled: true,
          joingate_enabled: true,
          verification_enabled: true,
        },
        { log_channel_id: "chan-2", quarantine_role_id: "role-1" },
      ),
    );
    expect(issues).toEqual([]);
  });

  it("only flags what is actually missing", () => {
    const issues = buildSetupIssues(
      modules(
        {
          log_channel_id: "chan-1",
          antinuke_enabled: true,
          joingate_enabled: true,
          verification_enabled: false,
        },
        { log_channel_id: "chan-2", quarantine_role_id: "role-1" },
      ),
    );
    expect(issues.map((i) => i.id)).toEqual(["verification-enabled"]);
    expect(issues[0]?.title).toMatch(/verification/i);
    expect(issues[0]?.detail).toBeTruthy();
  });

  it("treats a missing module the same as an unconfigured one", () => {
    const issues = buildSetupIssues([]);
    expect(issues).toHaveLength(6);
  });
});
