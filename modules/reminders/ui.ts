import {
  type CardReply,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
} from "@lumi/ui";
import type { ReminderRecord } from "./store.js";

const TextLimit = 1500;

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function timestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1_000)}:F>`;
}

function relative(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1_000)}:R>`;
}

export function shortReminderId(id: string): string {
  return id.slice(0, 8);
}

export function truncateReminderMessage(message: string): string {
  return cut(message, TextLimit);
}

export function reminderDeliveryCard(
  reminder: ReminderRecord,
  viaChannel: boolean,
): CardReply {
  const body = [cut(reminder.message, TextLimit)];
  if (viaChannel) {
    body.push(`**Reminder for** <@${reminder.userId}>`);
  }
  if (reminder.recurringCron) {
    body.push(`**Repeats** \`${reminder.recurringCron}\` (UTC)`);
  }
  return makeInfoCard("⏰ Reminder", body, {
    subtitle: `Scheduled ${relative(reminder.createdAt)}`,
    footer: `Reminder ${shortReminderId(reminder.id)}`,
  });
}

export function reminderCreatedCard(
  reminder: ReminderRecord,
  nextAt: Date,
): CardReply {
  const body = [
    `**When** ${timestamp(nextAt)} (${relative(nextAt)})`,
    `**Message**\n${cut(reminder.message, TextLimit)}`,
  ];
  if (reminder.recurringCron) {
    body.push(`**Repeats** \`${reminder.recurringCron}\` (UTC)`);
  }
  if (reminder.channelId) {
    body.push(`**Fallback channel** <#${reminder.channelId}>`);
  }
  return makeSuccessCard("Reminder Set", body, {
    footer: `Use /remind cancel id:${shortReminderId(reminder.id)} to cancel`,
  });
}

export function reminderListCard(reminders: ReminderRecord[]): CardReply {
  const items = reminders.map((reminder) => {
    const repeat = reminder.recurringCron
      ? ` · repeats \`${reminder.recurringCron}\``
      : "";
    const status = reminder.status === "pending" ? "" : ` · ${reminder.status}`;
    return `\`${shortReminderId(reminder.id)}\` · ${relative(reminder.remindAt)} · ${cut(reminder.message, 120)}${repeat}${status}`;
  });
  return makeListCard("⏰ Your Reminders", items, {
    subtitle: "Soonest first",
    footer: "Use /remind cancel or /remind snooze with a reminder ID",
  });
}

export function reminderCancelledCard(reminder: ReminderRecord): CardReply {
  return makeSuccessCard("Reminder Cancelled", [
    `**Reminder** \`${shortReminderId(reminder.id)}\``,
    `**Message**\n${cut(reminder.message, TextLimit)}`,
  ]);
}

export function reminderClearedCard(count: number): CardReply {
  return makeSuccessCard(
    "Reminders Cleared",
    count === 1
      ? "Cancelled 1 active reminder."
      : `Cancelled ${count} active reminders.`,
  );
}

export function reminderSnoozedCard(
  reminder: ReminderRecord,
  nextAt: Date,
): CardReply {
  return makeSuccessCard("Reminder Snoozed", [
    `**Reminder** \`${shortReminderId(reminder.id)}\``,
    `**When** ${timestamp(nextAt)} (${relative(nextAt)})`,
    `**Message**\n${cut(reminder.message, TextLimit)}`,
  ]);
}
