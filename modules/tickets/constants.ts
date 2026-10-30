export const TicketsModuleName = "tickets";
export const TicketsConfigKey = "tickets";

export const Priorities = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof Priorities)[number];

export const PriorityEmoji: Record<Priority, string> = {
  low: "🟢",
  normal: "🔵",
  high: "🟠",
  urgent: "🔴",
};

export const TicketStatus = {
  Open: "open",
  Closed: "closed",
} as const;

export const TicketIds = {
  panelSelect: (panelId: string) => `tickets:panel:${panelId}:select`,
  panelOpen: (panelId: string) => `tickets:panel:${panelId}:open`,
  modalOpen: (panelId: string, categoryId: string) =>
    `tickets:modal:open:${panelId}:${categoryId}`,
  feedback: (ticketId: string, rating: number) =>
    `tickets:feedback:${ticketId}:${rating}`,
} as const;

export const TicketPrefixes = {
  panel: "tickets:panel:",
  modalOpen: "tickets:modal:open:",
  feedback: "tickets:feedback:",
} as const;
