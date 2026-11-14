import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import {
  type CardReply,
  createActionButton,
  ephemeralCard,
  makeCard,
  makeErrorCard,
  makeSuccessCard,
  row,
} from "@lumi/ui";
import type { ButtonInteraction } from "discord.js";
import {
  AttachmentBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type SendableChannels,
  type User,
} from "discord.js";
import { getQuoteConfig, type QuoteConfig } from "./config.js";
import { QuoteAttachmentName, QuoteModuleName } from "./constants.js";
import {
  extractQuoteText,
  parseMessageReference,
  type QuoteMessageReference,
  resolveTextMentions,
  stripQuoteInvocation,
} from "./reference.js";
import {
  defaultQuoteRenderer,
  type QuoteInput,
  type QuoteRenderer,
  type QuoteRenderOptions,
} from "./render.js";

export interface PrefixAwareInteraction extends ChatInputCommandInteraction {
  sourceMessage?: Message;
  prefix?: string;
}

type QuoteRequest =
  { ok: true; input: QuoteInput } | { ok: false; title: string; body: string };

export const QUOTE_REMOVE_PREFIX = "quote:rm:" as const;

function renderOptions(config: QuoteConfig): QuoteRenderOptions {
  return {
    color: config.theme === "color",
    watermark: config.watermark,
    nameSource: config.nameSource,
    avatarSource: config.avatarSource,
    stripMarkdown: config.stripMarkdown,
    resolveMentions: config.resolveMentions,
  };
}

function avatarUrlFor(
  user: User,
  member: GuildMember | null,
  config: QuoteConfig,
): string {
  const options = { size: 256, extension: "png" as const };
  if (config.avatarSource === "guild" && member) {
    return member.displayAvatarURL(options);
  }
  return user.displayAvatarURL(options);
}

function textQuoteInput(
  text: string,
  user: User,
  member: GuildMember | null,
  config: QuoteConfig,
  guild: Guild | null,
): QuoteInput {
  return {
    kind: "text",
    text: config.resolveMentions ? resolveTextMentions(text, guild) : text,
    username: user.username,
    displayName: member?.displayName ?? user.globalName ?? user.username,
    avatarUrl: avatarUrlFor(user, member, config),
    options: renderOptions(config),
  };
}

function messageQuoteInput(
  message: Message,
  config: QuoteConfig,
): QuoteInput | null {
  const text = extractQuoteText(message);
  if (text.length === 0) return null;

  if (message.content.trim().length === 0) {
    return textQuoteInput(
      text,
      message.author,
      message.member,
      config,
      message.guild ?? null,
    );
  }

  return {
    kind: "message",
    message,
    options: renderOptions(config),
  };
}

async function fetchMessage(
  interaction: PrefixAwareInteraction,
  reference: QuoteMessageReference,
): Promise<Message | null> {
  const channelId = reference.channelId ?? interaction.channelId;
  if (!channelId) return null;

  const channel =
    channelId === interaction.channelId
      ? interaction.channel
      : await interaction.client.channels.fetch(channelId).catch(() => null);

  if (!channel?.isTextBased()) return null;
  return channel.messages.fetch(reference.messageId).catch(() => null);
}

function missingTextRequest(): QuoteRequest {
  return {
    ok: false,
    title: "Nothing to Quote",
    body: "That message has no text, attachments, or embed text to quote.",
  };
}

async function resolveSlashRequest(
  interaction: PrefixAwareInteraction,
  config: QuoteConfig,
): Promise<QuoteRequest> {
  const value = interaction.options.getString("message")?.trim();
  if (value) {
    const reference = parseMessageReference(value);
    if (!reference) {
      return {
        ok: false,
        title: "Invalid Message",
        body: "Provide a Discord message link or message ID.",
      };
    }
    if (reference.guildId && reference.guildId !== interaction.guildId) {
      return {
        ok: false,
        title: "Wrong Server",
        body: "That message link points to another server.",
      };
    }

    const message = await fetchMessage(interaction, reference);
    if (!message) {
      return {
        ok: false,
        title: "Message Not Found",
        body: "I couldn't fetch that message. Check the link and try again.",
      };
    }

    const input = messageQuoteInput(message, config);
    return input ? { ok: true, input } : missingTextRequest();
  }

  const text = interaction.options.getString("text")?.trim();
  if (!text) {
    return {
      ok: false,
      title: "Nothing to Quote",
      body: "Provide a message link or ID, or add text to quote.",
    };
  }

  const user = interaction.options.getUser("user") ?? interaction.user;
  const member = interaction.guild?.members.cache.get(user.id) ?? null;
  return {
    ok: true,
    input: textQuoteInput(
      text,
      user,
      member,
      config,
      interaction.guild ?? null,
    ),
  };
}

async function resolvePrefixRequest(
  interaction: PrefixAwareInteraction,
  config: QuoteConfig,
): Promise<QuoteRequest> {
  const source = interaction.sourceMessage;
  if (!source) return missingTextRequest();

  if (source.reference?.messageId) {
    const replied = await source.fetchReference().catch(() => null);
    if (replied) {
      const input = messageQuoteInput(replied, config);
      return input ? { ok: true, input } : missingTextRequest();
    }
  }

  const body = stripQuoteInvocation(source.content, interaction.prefix ?? "");
  if (!body) {
    return {
      ok: false,
      title: "Nothing to Quote",
      body: "Reply to a message, link a message, or add text after the command.",
    };
  }

  const reference = parseMessageReference(body);
  if (reference) {
    if (reference.guildId && reference.guildId !== source.guildId) {
      return {
        ok: false,
        title: "Wrong Server",
        body: "That message link points to another server.",
      };
    }

    const message = await fetchMessage(interaction, reference);
    if (!message) {
      return {
        ok: false,
        title: "Message Not Found",
        body: "I couldn't fetch that message. Check the link and try again.",
      };
    }

    const input = messageQuoteInput(message, config);
    return input ? { ok: true, input } : missingTextRequest();
  }

  return {
    ok: true,
    input: textQuoteInput(
      body,
      source.author,
      source.member,
      config,
      source.guild ?? null,
    ),
  };
}

async function resolveTargetChannel(
  interaction: PrefixAwareInteraction,
  config: QuoteConfig,
): Promise<SendableChannels | null> {
  if (!config.channelId) return null;

  const channel = await interaction.client.channels
    .fetch(config.channelId)
    .catch(() => null);
  if (!channel?.isSendable()) return null;
  return channel;
}

async function acknowledge(
  interaction: PrefixAwareInteraction,
  target: SendableChannels,
): Promise<void> {
  if (interaction.sourceMessage) {
    await interaction.sourceMessage.react("✅").catch(() => undefined);
    return;
  }

  await interaction.reply(
    ephemeralCard(makeSuccessCard("Quote Posted", `Sent to <#${target.id}>.`)),
  );
}

async function deliverQuote(
  interaction: PrefixAwareInteraction,
  config: QuoteConfig,
  card: CardReply,
  attachment: AttachmentBuilder,
  services: ModuleServices,
  quotedAuthorId?: string,
  originalMessage?: Message,
): Promise<{ quoteMessage: Message; linkMessage?: Message }> {
  const removeButton = quotedAuthorId
    ? row(
        createActionButton({
          customId: `${QUOTE_REMOVE_PREFIX}${quotedAuthorId}`,
          label: "Remove my quote",
          style: ButtonStyle.Danger,
        }),
      )
    : undefined;

  const link = originalMessage
    ? `\n\n🔗 [Source message](https://discord.com/channels/${originalMessage.guildId}/${originalMessage.channelId}/${originalMessage.id})`
    : "";

  const cardWithButton = removeButton
    ? makeCard(undefined, "", link, {
        headerImages: [`attachment://${QuoteAttachmentName}`],
        hideTitle: true,
        noAccent: true,
        actionRows: [removeButton],
      })
    : link.length > 0
      ? makeCard(undefined, "", link, {
          headerImages: [`attachment://${QuoteAttachmentName}`],
          hideTitle: true,
          noAccent: true,
        })
      : card;

  const payload = {
    ...cardWithButton,
    files: [attachment],
  };

  const target = await resolveTargetChannel(interaction, config);
  let quoteMessage: Message;
  if (target && target.id !== interaction.channelId) {
    try {
      quoteMessage = await target.send(payload);
      await acknowledge(interaction, target);
    } catch (error) {
      services.observability?.logger?.warn?.(
        "[quote] configured channel send failed, falling back to the current channel",
        { channelId: target.id, error },
      );
      await interaction.reply(payload);
      quoteMessage = await interaction.fetchReply();
    }
  } else {
    await interaction.reply(payload);
    quoteMessage = await interaction.fetchReply();
  }

  return { quoteMessage, linkMessage: undefined };
}

async function replyError(
  interaction: PrefixAwareInteraction,
  title: string,
  body: string,
): Promise<void> {
  await interaction.reply(ephemeralCard(makeErrorCard(title, body)));
}

export async function executeQuote(options: {
  interaction: PrefixAwareInteraction;
  services: ModuleServices;
  renderer?: QuoteRenderer;
}): Promise<void> {
  const { interaction, services, renderer = defaultQuoteRenderer } = options;
  const guildId = interaction.guildId;

  if (!guildId) {
    await replyError(
      interaction,
      "Server Only",
      "Quotes can only be generated inside a server.",
    );
    return;
  }

  if (!services.modules.isEnabled(guildId, QuoteModuleName)) {
    await replyError(
      interaction,
      "Module Disabled",
      "The Quotes module is disabled on this server.",
    );
    return;
  }

  const config = await getQuoteConfig(services, guildId);
  const request = interaction.sourceMessage
    ? await resolvePrefixRequest(interaction, config)
    : await resolveSlashRequest(interaction, config);

  if (!request.ok) {
    await replyError(interaction, request.title, request.body);
    return;
  }

  let buffer: Buffer;
  try {
    buffer = await renderer.render(request.input);
  } catch (error) {
    services.observability?.logger?.error?.("[quote] render failed", {
      guildId,
      error,
    });
    await replyError(
      interaction,
      "Quote Failed",
      "The quote image could not be generated. The renderer may be unavailable; try again later.",
    );
    return;
  }
  const attachment = new AttachmentBuilder(buffer, {
    name: QuoteAttachmentName,
  });
  const card = makeCard(undefined, "", "", {
    headerImages: [`attachment://${QuoteAttachmentName}`],
    hideTitle: true,
    noAccent: true,
  });

  const quotedAuthorId =
    request.input.kind === "message"
      ? request.input.message.author.id
      : undefined;
  const originalMessage =
    request.input.kind === "message" ? request.input.message : undefined;

  await deliverQuote(
    interaction,
    config,
    card,
    attachment,
    services,
    quotedAuthorId,
    originalMessage,
  );
}
export const quoteRemoveListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(QUOTE_REMOVE_PREFIX)) return;

    const payload = interaction.customId.slice(QUOTE_REMOVE_PREFIX.length);
    const [authorId] = payload.split(":");
    if (!authorId) return;

    if (interaction.user.id !== authorId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Quote",
            "Only the original quoted user can remove this quote.",
          ),
        ),
      );
      return;
    }

    const quoteMessage = interaction.message;
    if (quoteMessage.author.id !== interaction.client.user?.id) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Invalid", "That message is not a bot quote."),
        ),
      );
      return;
    }

    await quoteMessage.delete().catch(() => undefined);
    await interaction.deferUpdate().catch(() => undefined);
  },
};
