export type { DoctorCheckFn, DoctorCheckResult, DoctorStatus } from "#lib/doctor/types.js";
export { runDoctor, defaultDoctorChecks, type RunDoctorOptions } from "#lib/doctor/runner.js";
export {
  formatDoctorReport,
  doctorExitCode,
  type FormatDoctorReportOptions,
} from "#lib/doctor/formatter.js";

export { checkDiscordToken, DiscordTokenCheckName } from "#lib/doctor/checks/discord-token.js";
export {
  checkPrivilegedIntents,
  PrivilegedIntentsCheckName,
} from "#lib/doctor/checks/privileged-intents.js";
export { checkPostgres, PostgresCheckName } from "#lib/doctor/checks/postgres.js";
export { checkValkey, ValkeyCheckName } from "#lib/doctor/checks/valkey.js";
export { checkRpc, RpcCheckName } from "#lib/doctor/checks/rpc.js";
export {
  checkDashboardOAuth,
  DashboardOAuthCheckName,
} from "#lib/doctor/checks/dashboard-oauth.js";
export { checkFilesystem, FilesystemCheckName } from "#lib/doctor/checks/filesystem.js";
export { checkAddonCompat, AddonCompatCheckName } from "#lib/doctor/checks/addon-compat.js";
export { checkQueueHealth, QueueHealthCheckName } from "#lib/doctor/checks/queue-health.js";
