export const TicketsModuleName = "community-tickets";
export const TicketsConfigKey = "tickets";

export const Priorities = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof Priorities)[number];

export const PriorityEmoji: Record<Priority, string> = {
  low: "🟢",
  normal: "🔵",
  high: "🟠",
  urgent: "🔴",
};

export const TicketIds = {
  panelSelect: (panelId: string) => `tickets:panel:${panelId}:select`,
  panelOpen: (panelId: string) => `tickets:panel:${panelId}:open`,
  modalOpen: (panelId: string, categoryId: string) =>
    `tickets:modal:open:${panelId}:${categoryId}`,
  openMenu: (token: string, questionIndex: number) =>
    `tickets:open:menu:${token}:${questionIndex}`,
  openSkip: (token: string, questionIndex: number) =>
    `tickets:open:skip:${token}:${questionIndex}`,
  openModal: (token: string) => `tickets:open:modal:${token}`,
  feedback: (ticketId: string, rating: number) =>
    `tickets:feedback:${ticketId}:${rating}`,
} as const;
