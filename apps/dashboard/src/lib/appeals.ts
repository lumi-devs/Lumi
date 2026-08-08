// Imported by both the server page and the client table so the two can't
// drift in how they label or classify the same status — mirrors
// `moderation-cases.ts`'s `CASE_ACTION_LABELS` pattern.
import { APPEAL_STATUSES, type AppealStatus } from "@lumi/contracts";
import type { BadgeProps } from "#/components/ui/badge";

export const APPEAL_STATUS_LABELS: Record<AppealStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  denied_blacklisted: "Denied + Blacklisted",
  dismissed: "Dismissed",
};

export const APPEAL_STATUS_BADGE_VARIANT: Record<
  AppealStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  pending: "warning",
  approved: "success",
  denied: "danger",
  denied_blacklisted: "danger",
  dismissed: "neutral",
};

export const APPEAL_STATUS_OPTIONS = APPEAL_STATUSES.map((value) => ({
  value,
  label: APPEAL_STATUS_LABELS[value],
}));

export function isAppealStatus(value: string): value is AppealStatus {
  return (APPEAL_STATUSES as readonly string[]).includes(value);
}
