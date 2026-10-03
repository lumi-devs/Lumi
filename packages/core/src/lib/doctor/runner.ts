import type { DoctorCheckFn, DoctorCheckResult } from "#lib/doctor/types.js";
import { checkDiscordToken } from "#lib/doctor/checks/discord-token.js";
import { checkPrivilegedIntents } from "#lib/doctor/checks/privileged-intents.js";
import { checkPostgres } from "#lib/doctor/checks/postgres.js";
import { checkRedis } from "#lib/doctor/checks/redis.js";
import { checkRpc } from "#lib/doctor/checks/rpc.js";
import { checkDashboardOAuth } from "#lib/doctor/checks/dashboard-oauth.js";
import { checkFilesystem } from "#lib/doctor/checks/filesystem.js";
import { checkAddonCompat } from "#lib/doctor/checks/addon-compat.js";
import { checkQueueHealth } from "#lib/doctor/checks/queue-health.js";

/** Every check `runDoctor()` runs by default, in report order. */
export const defaultDoctorChecks: DoctorCheckFn[] = [
  () => checkDiscordToken(),
  () => checkPrivilegedIntents(),
  () => checkPostgres(),
  () => checkRedis(),
  () => checkRpc(),
  () => checkDashboardOAuth(),
  () => checkFilesystem(),
  () => checkAddonCompat(),
  () => checkQueueHealth(),
];

export interface RunDoctorOptions {
  /** Override the check list, e.g. to run a subset or inject test doubles. */
  checks?: DoctorCheckFn[];
  /**
   * Backstop for the whole run, on top of each check's own timeout - a check
   * that ignores its own timeout (a bug in that check) still can't hang
   * `runDoctor()` forever.
   */
  globalTimeoutMs?: number;
}

const DefaultGlobalTimeoutMs = 30_000;

function timeoutResult(name: string): DoctorCheckResult {
  return { name, status: "fail", detail: "timed out (global doctor timeout)" };
}

/** Runs every doctor check concurrently and returns their results, in the checks' own order. */
export async function runDoctor(
  options: RunDoctorOptions = {},
): Promise<DoctorCheckResult[]> {
  const checks = options.checks ?? defaultDoctorChecks;
  const globalTimeoutMs = options.globalTimeoutMs ?? DefaultGlobalTimeoutMs;

  return Promise.all(
    checks.map(async (check, index) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<DoctorCheckResult>((resolve) => {
        timer = setTimeout(() => resolve(timeoutResult(`check-${index}`)), globalTimeoutMs);
        timer.unref?.();
      });
      try {
        return await Promise.race([check(), timeoutPromise]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }),
  );
}
