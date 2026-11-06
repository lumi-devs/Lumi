import type { ModuleServices } from "@lumi/module-kit";
import { cardCreateOptions, makeInfoCard } from "@lumi/ui";
import type { ThreadChannel } from "discord.js";
import { safeRegexTest } from "../../shared/regex.js";
import { warnInvalidRegexPatterns } from "../../shared/regex-warnings.js";
import type { TicketsConfig } from "./config.js";
import { escapeHtml } from "./html.js";
import type { TicketRecord } from "./repository.js";

export async function applyAutoTags(
  services: ModuleServices,
  config: TicketsConfig,
  ticket: TicketRecord,
  thread: ThreadChannel,
  text: string,
): Promise<string[]> {
  if (!config.autoTagEnabled || !text.trim()) return [];

  const tags = await services.helpers.tickets
    .listAutoTags(ticket.guildId)
    .catch(() => []);
  warnInvalidRegexPatterns(
    services,
    "tickets",
    ticket.guildId,
    "auto-tag",
    tags.flatMap((tag) => (tag.regex ? [tag.regex] : [])),
  );
  const applied: string[] = [];

  for (const tag of tags) {
    if (!tag.regex) continue;
    if (!safeRegexTest(tag.regex, text)) continue;

    const alreadyApplied = await services.helpers.tickets
      .hasTagApplication(ticket.id, tag.id)
      .catch(() => true);
    if (alreadyApplied) continue;

    await services.helpers.tickets
      .createTagApplication(ticket.id, tag.id)
      .catch(() => undefined);

    const card = makeInfoCard(`📎 ${tag.name}`, tag.content, {
      subtitle: "Auto-tag reply",
      footer: "Matched automatically from this ticket's messages",
    });
    const message = await thread
      .send(cardCreateOptions(card))
      .catch(() => null);
    if (message) {
      applied.push(tag.name);
      await services.helpers.tickets
        .createMessage({
          ticketId: ticket.id,
          messageId: message.id,
          authorId: services.client.user?.id ?? "system",
          authorName: "Lumi",
          content: escapeHtml(`📎 ${tag.name}\n${tag.content}`),
          attachments: [],
        })
        .catch(() => undefined);
    }
  }

  return applied;
}
