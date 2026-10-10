import { envIsDefined } from "@lumi/lib/env.js";
import { runCheck } from "@lumi/lib/doctor/run-check.js";
import type { DoctorCheckResult } from "@lumi/lib/doctor/types.js";

export const DashboardOAuthCheckName = "dashboard-oauth";

/**
 * The dashboard is its own deployment (its own repo, `lumi-devs/lumi-dashboard`)
 * with its own env parsing - these three are required for OAuth login to work. This check
 * never fails: an operator running only the worker/api/scheduler side
 * legitimately has none of these set.
 */
const RequiredDashboardOAuthKeys = [
  "DISCORD_OAUTH2_CLIENT_ID",
  "DISCORD_OAUTH2_CLIENT_SECRET",
  "DASHBOARD_SESSION_SECRET",
] as const;

export interface DashboardOAuthCheckDeps {
  /** Override for tests; defaults to `envIsDefined()`. */
  isDefined?: (key: string) => boolean;
}

export async function checkDashboardOAuth(
  deps: DashboardOAuthCheckDeps = {},
  timeoutMs = 1_000,
): Promise<DoctorCheckResult> {
  return runCheck(DashboardOAuthCheckName, timeoutMs, () => {
    const isDefined = deps.isDefined ?? envIsDefined;
    const present = RequiredDashboardOAuthKeys.filter((key) => isDefined(key));
    const missing = RequiredDashboardOAuthKeys.filter((key) => !isDefined(key));

    if (present.length === 0) {
      return Promise.resolve({
        name: DashboardOAuthCheckName,
        status: "skip",
        detail: "No dashboard OAuth env vars are set on this host - fine if the dashboard is deployed elsewhere.",
      });
    }
    if (missing.length > 0) {
      return Promise.resolve({
        name: DashboardOAuthCheckName,
        status: "warn",
        detail: `Dashboard OAuth env is partially configured; missing: ${missing.join(", ")}.`,
        hint: "If this host runs the dashboard, set all of: " + RequiredDashboardOAuthKeys.join(", "),
      });
    }
    return Promise.resolve({
      name: DashboardOAuthCheckName,
      status: "ok",
      detail: "Dashboard OAuth env vars are all present.",
    });
  });
}
