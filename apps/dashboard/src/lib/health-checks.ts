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

export interface HealthCheck {
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

export function buildHealthChecks(
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
