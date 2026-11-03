import {
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
  type TaskDefinition,
} from "@lumi/module-kit";
import type { Interaction } from "discord.js";
import { ticketCommand } from "./commands.js";
import { TicketsConfigSchema } from "./config.js";
import { TicketsModuleName } from "./constants.js";
import { handleTicketInteraction } from "./interactions.js";
import { ticketMessageListener } from "./listeners.js";
import {
  sweepExpiredClosedTickets,
  sweepInactiveTickets,
} from "./ticket-service.js";

const ticketInteractionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    await handleTicketInteraction(interaction, services);
  },
};

const autoCloseTask: TaskDefinition = {
  name: "auto-close",
  cron: "*/5 * * * *",
  timezone: "UTC",
  async handler(services) {
    await sweepInactiveTickets(services);
  },
};

const retentionTask: TaskDefinition = {
  name: "retention-cleanup",
  cron: "23 3 * * *",
  timezone: "UTC",
  async handler(services) {
    await sweepExpiredClosedTickets(services);
  },
};

const ticketsModule: ModuleDefinition = defineModule({
  name: TicketsModuleName,
  displayName: "Tickets",
  emoji: "🎫",
  description:
    "Private support ticket threads with categories, claims, priorities, notes, tags, transcripts, and feedback",
  version: "2.0.0",
  config: TicketsConfigSchema,
  dataLifecycle: {
    async exportUserData(services, guildId, userId) {
      return services.helpers.tickets.listTicketsForUser(guildId, userId);
    },
    async deleteUserData(services, guildId, userId) {
      return services.helpers.tickets.anonymiseUserData(guildId, userId);
    },
  },
  commands: [ticketCommand],
  listeners: [ticketMessageListener, ticketInteractionListener],
  tasks: [autoCloseTask, retentionTask],
  async onLoad(_services) {
    console.log("[tickets] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[tickets] Module unloaded");
  },
});

export default ticketsModule;
