import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import { Events, type Message } from "discord.js";
import { isTicketsModuleEnabled } from "./config.js";
import { archiveMessage, findTicketByChannel, prismaOf } from "./repository.js";

export const ticketMessageListener: ListenerDefinition = {
  event: Events.MessageCreate,
  async handler(message: Message, services: ModuleServices) {
    if (!message.guild) return;
    if (!isTicketsModuleEnabled(services, message.guild.id)) return;
    if (!message.channel.isThread()) return;

    const ticket = await findTicketByChannel(services, message.channel.id);
    if (!ticket || ticket.guildId !== message.guild.id) return;
    if (ticket.status !== "open") return;

    await archiveMessage(services, ticket.id, {
      id: message.id,
      content: message.content,
      author: message.author,
      member: message.member ?? null,
      createdAt: message.createdAt,
      attachments: message.attachments,
    });

    if (!message.author.bot) {
      const prisma = prismaOf(services);
      await prisma.ticket
        .update({
          where: { id: ticket.id },
          data: { lastActivityAt: new Date() },
        })
        .catch(() => undefined);
    }
  },
};
