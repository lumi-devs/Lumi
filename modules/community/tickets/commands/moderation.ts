import { requireGuildId } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import type { ChatInputCommandInteraction } from "discord.js";
import { getTicketsConfig } from "../config.js";
import { escapeHtml } from "../html.js";
import { resolveThread } from "../ticket-service.js";
import {
  clearable,
  replyCard,
  replyError,
  requireStaff,
  requireTicketAccess,
} from "./shared.js";

export async function blacklistCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  action: string,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const config = await getTicketsConfig(services, guildId);
  if (!(await requireStaff(interaction, services, config))) return;

  if (action === "add") {
    const user = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason")?.slice(0, 500) ?? null;
    await services.helpers.tickets.upsertBlacklist(guildId, user.id, {
      reason,
      createdBy: interaction.user.id,
    });
    await replyCard(
      interaction,
      makeSuccessCard(
        "Member Blacklisted",
        `<@${user.id}> can no longer open tickets.`,
      ),
    );
    return;
  }

  if (action === "remove") {
    const user = interaction.options.getUser("user", true);
    const deleted = await services.helpers.tickets
      .removeBlacklist(guildId, user.id)
      .catch(() => null);
    if (!deleted) {
      await replyCard(
        interaction,
        makeInfoCard(
          "Not Blacklisted",
          `<@${user.id}> is not on the ticket blacklist.`,
        ),
      );
      return;
    }
    await replyCard(
      interaction,
      makeSuccessCard(
        "Blacklist Removed",
        `<@${user.id}> can open tickets again.`,
      ),
    );
    return;
  }

  const rows = (await services.helpers.tickets
    .listBlacklist(guildId, 25)
    .catch(() => [])) as Array<{
    userId: string;
    reason: string | null;
    createdBy: string;
    createdAt: Date | string;
  }>;
  if (rows.length === 0) {
    await replyCard(
      interaction,
      makeInfoCard("Ticket Blacklist", "No members are blacklisted."),
    );
    return;
  }
  await replyCard(
    interaction,
    makeListCard(
      "Ticket Blacklist",
      rows.map(
        (row) =>
          `<@${row.userId}> — ${row.reason ?? "No reason"} · added by <@${row.createdBy}>`,
      ),
    ),
  );
}

export async function tagCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  action: string,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const config = await getTicketsConfig(services, guildId);
  if (!(await requireStaff(interaction, services, config))) return;

  if (action === "add") {
    const name = interaction.options.getString("name", true).trim();
    const content = interaction.options.getString("content", true).trim();
    const rawRegex = interaction.options.getString("regex")?.trim() ?? null;
    const autoTag = interaction.options.getBoolean("auto_tag") ?? false;
    if (!name || !content) {
      await replyError(
        interaction,
        "Invalid Tag",
        "A tag needs a name and content.",
      );
      return;
    }
    if (rawRegex) {
      try {
        new RegExp(rawRegex, "i");
      } catch {
        await replyError(
          interaction,
          "Invalid Regex",
          "The auto-tag pattern is not a valid regular expression.",
        );
        return;
      }
    }
    if (autoTag && !rawRegex) {
      await replyError(
        interaction,
        "Regex Required",
        "Auto-tagging needs a regex pattern to match messages.",
      );
      return;
    }
    try {
      await services.helpers.tickets.createTag({
        guildId,
        name: name.slice(0, 50),
        content: content.slice(0, 2000),
        regex: rawRegex?.slice(0, 200) ?? null,
        autoTag,
        createdBy: interaction.user.id,
      });
      await replyCard(
        interaction,
        makeSuccessCard("Tag Created", `Tag **${name}** is ready to use.`),
      );
    } catch {
      await replyError(
        interaction,
        "Tag Not Created",
        "A tag with that name may already exist.",
      );
    }
    return;
  }

  if (action === "edit") {
    const name = interaction.options.getString("name", true).trim();
    const data: {
      content?: string;
      regex?: string | null;
      autoTag?: boolean;
    } = {};
    const content = interaction.options.getString("content");
    if (content !== null) data.content = content.trim().slice(0, 2000);
    const regex = clearable(interaction.options.getString("regex"));
    if (regex !== undefined) {
      if (regex) {
        try {
          new RegExp(regex, "i");
        } catch {
          await replyError(
            interaction,
            "Invalid Regex",
            "The auto-tag pattern is not a valid regular expression.",
          );
          return;
        }
      }
      data.regex = regex?.slice(0, 200) ?? null;
    }
    const autoTag = interaction.options.getBoolean("auto_tag");
    if (autoTag !== null) data.autoTag = autoTag;
    if (Object.keys(data).length === 0) {
      await replyCard(
        interaction,
        makeWarningCard("Nothing To Change", "Provide at least one field to edit."),
      );
      return;
    }
    const existing = await services.helpers.tickets
      .findTag(guildId, name)
      .catch(() => null);
    if (!existing) {
      await replyCard(
        interaction,
        makeInfoCard("Tag Missing", `No tag named **${name}** exists.`),
      );
      return;
    }
    if (data.autoTag === true && !(data.regex ?? existing.regex)) {
      await replyError(
        interaction,
        "Regex Required",
        "Auto-tagging needs a regex pattern to match messages.",
      );
      return;
    }
    try {
      await services.helpers.tickets.updateTag(guildId, name, data);
      await replyCard(
        interaction,
        makeSuccessCard("Tag Updated", `Tag **${name}** has been updated.`),
      );
    } catch {
      await replyError(
        interaction,
        "Tag Not Updated",
        "The tag could not be updated.",
      );
    }
    return;
  }

  if (action === "remove") {
    const name = interaction.options.getString("name", true).trim();
    const deleted = await services.helpers.tickets
      .deleteTag(guildId, name)
      .catch(() => null);
    if (!deleted) {
      await replyCard(
        interaction,
        makeInfoCard("Tag Missing", `No tag named **${name}** exists.`),
      );
      return;
    }
    await replyCard(
      interaction,
      makeSuccessCard("Tag Removed", `Tag **${name}** has been removed.`),
    );
    return;
  }

  if (action === "list") {
    const tags = (await services.helpers.tickets
      .listTags(guildId, 25)
      .catch(() => [])) as Array<{
      name: string;
      content: string;
      regex: string | null;
      autoTag: boolean;
      createdBy: string;
    }>;
    if (tags.length === 0) {
      await replyCard(
        interaction,
        makeInfoCard("Ticket Tags", "No canned replies are configured."),
      );
      return;
    }
    await replyCard(
      interaction,
      makeListCard(
        "Ticket Tags",
        tags.map(
          (tag) =>
            `**${tag.name}**${tag.autoTag ? ` *(auto: \`${tag.regex ?? "—"}\`)*` : ""} — ${tag.content.slice(0, 120)}`,
        ),
      ),
    );
    return;
  }

  const context = await requireTicketAccess(interaction, services, {
    staffOnly: true,
    openOnly: true,
  });
  if (!context) return;
  const name = interaction.options.getString("name", true).trim();
  const tag = (await services.helpers.tickets
    .findTag(guildId, name)
    .catch(() => null)) as { content: string } | null;
  if (!tag) {
    await replyError(
      interaction,
      "Tag Missing",
      `No tag named **${name}** exists.`,
    );
    return;
  }
  const thread = await resolveThread(
    services,
    interaction.guild,
    context.ticket.channelId,
  );
  if (!thread) {
    await replyError(
      interaction,
      "Thread Missing",
      "The ticket thread no longer exists.",
    );
    return;
  }
  const card = makeInfoCard(`📎 ${name}`, tag.content, {
    subtitle: "Canned reply",
    footer: `Sent by ${interaction.user.tag}`,
  });
  const message = await thread.send(cardCreateOptions(card)).catch(() => null);
  await services.helpers.tickets
    .createMessage({
      ticketId: context.ticket.id,
      messageId: message?.id ?? null,
      authorId: interaction.user.id,
      authorName: interaction.user.tag,
      content: escapeHtml(tag.content),
      attachments: [],
    })
    .catch(() => undefined);
  await services.helpers.tickets
    .recordFirstResponse(context.ticket.id, interaction.user.id, new Date())
    .catch(() => undefined);
  await services.helpers.tickets
    .updateTicket(context.ticket.id, { lastActivityAt: new Date() })
    .catch(() => undefined);
  await replyCard(
    interaction,
    makeSuccessCard("Tag Sent", `Posted **${name}** in the ticket thread.`),
  );
}
