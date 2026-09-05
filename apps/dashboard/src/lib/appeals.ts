// Imported by both the server page and the client table so the two can't
// drift in how they label or classify the same status — mirrors
// `moderation-cases.ts`'s `CaseActionLabels` pattern.
import { AppealStatuses, type AppealStatus } from "@lumi/contracts";
import type { BadgeProps } from "#/components/ui/badge";

export const AppealStatusLabels: Record<AppealStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  denied_blacklisted: "Denied + Blacklisted",
  dismissed: "Dismissed",
};

export const AppealStatusBadgeVariant: Record<
  AppealStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  pending: "warning",
  approved: "success",
  denied: "danger",
  denied_blacklisted: "danger",
  dismissed: "neutral",
};

export const AppealStatusOptions = AppealStatuses.map((value) => ({
  value,
  label: AppealStatusLabels[value],
}));

export function isAppealStatus(value: string): value is AppealStatus {
  return (AppealStatuses as readonly string[]).includes(value);
}
