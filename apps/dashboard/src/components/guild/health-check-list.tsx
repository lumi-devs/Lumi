"use client";

import Link from "next/link";
import {
  CircleCheck,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "#/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { useStaggerIn } from "#/lib/animate";
import type { DashboardRoleView, DashboardModuleView } from "#/lib/dashboard-data";

// Native Discord permission bits (see Module.js `cfg` conventions elsewhere
// for why this stays dependency-free instead of importing discord.js on the
// client): https://discord.com/developers/docs/topics/permissions
const PERM_KICK_MEMBERS = 1n << 1n;
const PERM_BAN_MEMBERS = 1n << 2n;
const PERM_ADMINISTRATOR = 1n << 3n;

const DANGEROUS_PERMS: Array<{ bit: bigint; label: string }> = [
  { bit: PERM_ADMINISTRATOR, label: "Administrator" },
  { bit: PERM_BAN_MEMBERS, label: "Ban Members" },
  { bit: PERM_KICK_MEMBERS, label: "Kick Members" },
];

interface HealthCheck {
  id: string;
  ok: boolean;
  title: string;
  detail: string;
  fixHref?: string;
  fixLabel?: string;
}

function hasFlag(permissions: string, bit: bigint): boolean {
  try {
    return (BigInt(permissions) & bit) === bit;
  } catch {
    return false;
  }
}

function buildChecks(
  guildId: string,
  roles: DashboardRoleView[],
  securityConfig: Record<string, unknown> | undefined,
  filterModule: DashboardModuleView | undefined,
): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const base = `/guild/${guildId}`;

  const botRole = roles.find((r) => r.isBotRole);
  const higherRoles = botRole
    ? roles.filter((r) => r.position > botRole.position)
    : [];
  checks.push({
    id: "bot-role-position",
    ok: !botRole || higherRoles.length === 0,
    title: "Lumi's role is high enough in the hierarchy",
    detail: botRole
      ? higherRoles.length === 0
        ? `Lumi's role (${botRole.name}) is at the top of the moderatable range.`
        : `${higherRoles.length} role${higherRoles.length === 1 ? "" : "s"} sit above Lumi's role (${botRole.name}), which she can't moderate.`
      : "Lumi's role couldn't be determined from the roles fetched for this server.",
  });

  const dangerousRoles = roles.filter(
    (r) => !r.isBotRole && DANGEROUS_PERMS.some((p) => hasFlag(r.permissions, p.bit)),
  );
  checks.push({
    id: "dangerous-role-permissions",
    ok: dangerousRoles.length === 0,
    title: "No unexpected roles hold dangerous permissions",
    detail:
      dangerousRoles.length === 0
        ? "No non-bot role carries native Kick, Ban, or Administrator permissions."
        : `${dangerousRoles.map((r) => r.name).join(", ")} ${dangerousRoles.length === 1 ? "carries" : "carry"} native Kick, Ban, and/or Administrator permissions.`,
  });

  const joingateEnabled = Boolean(securityConfig?.["joingate_enabled"]);
  checks.push({
    id: "joingate-enabled",
    ok: joingateEnabled,
    title: "Join Gate is enabled",
    detail: joingateEnabled
      ? "New members are screened for raids and throwaway accounts."
      : "New members join without account-age or raid screening.",
    fixHref: `${base}/security`,
    fixLabel: "Configure",
  });

  const verificationEnabled = Boolean(securityConfig?.["verification_enabled"]);
  checks.push({
    id: "verification-enabled",
    ok: verificationEnabled,
    title: "Verification is enabled",
    detail: verificationEnabled
      ? "Members must pass the verification panel before gaining access."
      : "Members aren't required to verify before participating.",
    fixHref: `${base}/security`,
    fixLabel: "Configure",
  });

  const antinukeEnabled = Boolean(securityConfig?.["antinuke_enabled"]);
  checks.push({
    id: "antinuke-enabled",
    ok: antinukeEnabled,
    title: "Anti-Nuke is enabled",
    detail: antinukeEnabled
      ? "Mass destructive actions are watched and auto-quarantined."
      : "Mass bans, kicks, or channel/role deletions won't trigger an automatic response.",
    fixHref: `${base}/security`,
    fixLabel: "Configure",
  });

  const filterConfig = filterModule?.config ?? {};
  const heatEnabled = Boolean(filterConfig["heat_enabled"]);
  const heatThresholdsConfigured = [
    "heat_warn",
    "heat_timeout",
    "heat_quarantine",
  ].some((key) => Number(filterConfig[key] ?? 0) > 0);
  const heatMisconfigured =
    filterModule?.enabled === true && !heatEnabled && heatThresholdsConfigured;
  checks.push({
    id: "filter-heat-configured",
    ok: !heatMisconfigured,
    title: "Filter heat/spam settings match the Heat System toggle",
    detail: heatMisconfigured
      ? "Heat thresholds are configured, but the Heat System toggle is off, so they never trigger."
      : "Heat scoring thresholds and the Heat System toggle are in sync.",
    fixHref: `${base}/modules/filter`,
    fixLabel: "Configure",
  });

  return checks;
}

function CheckRow({ check }: { check: HealthCheck }) {
  const Icon: LucideIcon = check.ok ? CircleCheck : CircleAlert;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
          check.ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-5 font-medium text-fg">{check.title}</p>
        <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">{check.detail}</p>
      </div>
      {!check.ok && check.fixHref ? (
        <Link
          href={check.fixHref}
          className="shrink-0 self-center text-[12px] font-medium text-accent-fg hover:underline"
        >
          {check.fixLabel ?? "Fix"}
        </Link>
      ) : null}
    </div>
  );
}

export function HealthCheckList({
  guildId,
  roles,
  securityConfig,
  filterModule,
}: {
  guildId: string;
  roles: DashboardRoleView[];
  securityConfig: Record<string, unknown> | undefined;
  filterModule: DashboardModuleView | undefined;
}) {
  const checks = buildChecks(guildId, roles, securityConfig, filterModule);
  const passing = checks.filter((c) => c.ok).length;
  const containerRef = useStaggerIn<HTMLDivElement>("[data-check-row]", { resetKey: guildId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health Check</CardTitle>
        <CardDescription>
          {passing} of {checks.length} checks passing.
        </CardDescription>
      </CardHeader>
      <div ref={containerRef} className="divide-y divide-border">
        {checks.map((check) => (
          <div key={check.id} data-check-row>
            <CheckRow check={check} />
          </div>
        ))}
      </div>
    </Card>
  );
}
