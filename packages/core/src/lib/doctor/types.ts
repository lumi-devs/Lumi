export type DoctorStatus = "ok" | "warn" | "fail" | "skip";

export interface DoctorCheckResult {
  name: string;
  status: DoctorStatus;
  detail: string;
  hint?: string;
}

export type DoctorCheckFn = () => Promise<DoctorCheckResult>;
