import { Priorities, type Priority } from "./constants.js";

export interface TicketValidationRecord {
  status: string;
  userId: string;
  feedback?: number | null;
  closedAt?: Date | string | null;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export const DefaultCloseReason = "No reason provided";

export function isPriority(value: unknown): value is Priority {
  return (
    typeof value === "string" &&
    (Priorities as readonly string[]).includes(value)
  );
}

export function validateCloseReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) return DefaultCloseReason;
  return trimmed.slice(0, 1000);
}

export function canCloseTicket(
  ticket: TicketValidationRecord,
  actorId: string,
  isStaff: boolean,
): ValidationResult {
  if (ticket.status !== "open") {
    return { ok: false, reason: "This ticket is already closed." };
  }
  if (ticket.userId !== actorId && !isStaff) {
    return {
      ok: false,
      reason: "Only the ticket opener or a staff member can close this ticket.",
    };
  }
  return { ok: true };
}

export function validateFeedback(
  ticket: TicketValidationRecord,
  actorId: string,
  rating: number,
  enabled: boolean,
): ValidationResult {
  if (!enabled) {
    return { ok: false, reason: "Ticket feedback is disabled on this server." };
  }
  if (ticket.status !== "closed") {
    return {
      ok: false,
      reason: "Feedback can only be submitted after the ticket is closed.",
    };
  }
  if (ticket.userId !== actorId) {
    return {
      ok: false,
      reason: "Only the member who opened the ticket can leave feedback.",
    };
  }
  if (ticket.feedback !== null && ticket.feedback !== undefined) {
    return { ok: false, reason: "Feedback has already been submitted." };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, reason: "Rating must be a whole number from 1 to 5." };
  }
  return { ok: true };
}
