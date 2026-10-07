export type { DoctorCheckFn, DoctorCheckResult, DoctorStatus } from "#lib/doctor/types.js";
export { runDoctor, defaultDoctorChecks, type RunDoctorOptions } from "#lib/doctor/runner.js";
export {
  formatDoctorReport,
  doctorExitCode,
  type FormatDoctorReportOptions,
} from "#lib/doctor/formatter.js";
