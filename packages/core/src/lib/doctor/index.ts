export type { DoctorCheckFn, DoctorCheckResult, DoctorStatus } from "@lumi/lib/doctor/types.js";
export { runDoctor, defaultDoctorChecks, type RunDoctorOptions } from "@lumi/lib/doctor/runner.js";
export {
  formatDoctorReport,
  doctorExitCode,
  type FormatDoctorReportOptions,
} from "@lumi/lib/doctor/formatter.js";
