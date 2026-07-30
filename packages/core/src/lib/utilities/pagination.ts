import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  SeparatorSpacingSize,
} from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { Emojis } from "#lib/utilities/assets.js";
import { NavigationSession, encodeNavCustomId } from "./ui/navigation.js";
import type { CardReply } from "./ui/types.js";

export interface PaginationOptions {
  interactionOrMessage: ChatInputCommandInteraction | Message;
  totalPages: number;
  userId: string;
  customIdPrefix?: string;
  time?: number;
  ephemeral?: boolean;
  render: (pageIndex: number, c: ContainerBuilder) => void | Promise<void>;
}

export async function paginateContainer(options: PaginationOptions) {
  const {
    interactionOrMessage,
    totalPages,
    userId,
    customIdPrefix = "page",
    time = 60_000,
    ephemeral = false,
    render,
  } = options;

  let activePage = 0;

  const buildPage = async (
    pageIndex: number,
    disabled = false,
  ): Promise<CardReply> => {
    const c = new ContainerBuilder();
    await render(pageIndex, c);

    if (totalPages > 1) {
      const row =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${customIdPrefix}:prev`)
            .setLabel("Previous")
            .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || pageIndex <= 0),
          new ButtonBuilder()
            .setCustomId(`${customIdPrefix}:indicator`)
            .setLabel(`Page ${pageIndex + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`${customIdPrefix}:next`)
            .setLabel("Next")
            .setEmoji(Emojis.parse(Emojis.ARROW_RIGHT))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || pageIndex >= totalPages - 1),
        );

      c.addActionRowComponents((builder) => {
        builder.addComponents(...row.components);
        return builder;
      });
    }

    let flags = MessageFlags.IsComponentsV2;
    if (ephemeral) {
      flags |= MessageFlags.Ephemeral;
    }

    return {
      flags,
      components: [c],
      allowedMentions: { parse: [] },
    };
  };

  const isInteraction = "editReply" in interactionOrMessage;

  if (isInteraction) {
    const interaction = interactionOrMessage;
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
  }

  const initialCard = await buildPage(activePage);

  let msg: Message;
  if (isInteraction) {
    msg = await interactionOrMessage.editReply(initialCard);
  } else {
    msg = await interactionOrMessage.reply(initialCard);
  }

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time,
    filter: (i) => i.user.id === userId,
  });

  collector.on("collect", async (i) => {
    if (i.customId === `${customIdPrefix}:prev`) {
      activePage = Math.max(0, activePage - 1);
    } else if (i.customId === `${customIdPrefix}:next`) {
      activePage = Math.min(totalPages - 1, activePage + 1);
    } else {
      return;
    }
    const newCard = await buildPage(activePage);
    await i.update(newCard);
  });

  collector.on("end", async () => {
    const disabledCard = await buildPage(activePage, true);
    if (isInteraction) {
      await interactionOrMessage.editReply(disabledCard).catch(() => null);
    } else {
      await msg.edit(disabledCard).catch(() => null);
    }
  });
}

export interface PaginateListOptions {
  interactionOrMessage: ChatInputCommandInteraction | Message;
  userId: string;
  title: string;
  items: string[];
  perPage?: number;
  ephemeral?: boolean;
  customIdPrefix?: string;
  time?: number;
}

export async function paginateList(options: PaginateListOptions) {
  const {
    interactionOrMessage,
    userId,
    title,
    items,
    perPage = 10,
    ephemeral = false,
    customIdPrefix = "list",
    time = 60_000,
  } = options;

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));

  return paginateContainer({
    interactionOrMessage,
    userId,
    totalPages,
    ephemeral,
    customIdPrefix,
    time,
    render: (pageIndex, c) => {
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}`),
      );
      c.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true),
      );

      const slice = items.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
      const body = slice.length ? slice.join("\n") : "*Nothing here yet.*";

      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

      c.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(false),
      );

      const footer =
        totalPages > 1
          ? `Page ${pageIndex + 1} of ${totalPages} · Total ${items.length} items`
          : `Total ${items.length} items`;

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${footer}`),
      );
    },
  });
}

export interface SessionPaginationOptions {
  interaction: ChatInputCommandInteraction;
  userId: string;
  title: string;
  items: string[];
  perPage?: number;
  ephemeral?: boolean;
  time?: number;
}

export async function paginateListWithSession(
  options: SessionPaginationOptions,
): Promise<NavigationSession | null> {
  const {
    interaction,
    userId,
    title,
    items,
    perPage = 10,
    ephemeral = false,
    time = 60_000,
  } = options;

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const session = NavigationSession.create(userId);

  let activePage = 0;

  const renderPage = (pageIndex: number): CardReply => {
    const c = new ContainerBuilder();
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
    );
    c.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    );

    const slice = items.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
    const body = slice.length ? slice.join("\n") : "*Nothing here yet.*";

    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

    c.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(false),
    );

    const footer =
      totalPages > 1
        ? `Page ${pageIndex + 1} of ${totalPages} · Total ${items.length} items`
        : `Total ${items.length} items`;

    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${footer}`),
    );

    if (totalPages > 1) {
      c.addActionRowComponents((row) =>
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(encodeNavCustomId(session.id, "prev"))
            .setLabel("◀ Prev")
            .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex <= 0),
          new ButtonBuilder()
            .setCustomId(encodeNavCustomId(session.id, "next"))
            .setLabel("Next ▶")
            .setEmoji(Emojis.parse(Emojis.ARROW_RIGHT))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex >= totalPages - 1),
        ),
      );
    }

    let flags = MessageFlags.IsComponentsV2;
    if (ephemeral) flags |= MessageFlags.Ephemeral;

    return {
      flags,
      components: [c],
      allowedMentions: { parse: [] },
    };
  };

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral });
  }

  const initialCard = await renderPage(activePage);
  await interaction.editReply(initialCard);

  const collector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time,
    filter: (i) => i.user.id === userId,
  });

  if (!collector) {
    session.destroy();
    return null;
  }

  collector.on("collect", async (i) => {
    const parsed = parseNavCustomId(i.customId);
    if (!parsed || parsed.sessionId !== session.id) return;

    if (parsed.action === "prev") {
      activePage = Math.max(0, activePage - 1);
    } else if (parsed.action === "next") {
      activePage = Math.min(totalPages - 1, activePage + 1);
    } else {
      return;
    }

    const newCard = await renderPage(activePage);
    await i.update(newCard);
  });

  collector.on("end", () => {
    session.destroy();
  });

  return session;
}

function parseNavCustomId(customId: string): {
  sessionId: string;
  action: string;
} | null {
  const parts = customId.split(":");
  if (parts.length < 3 || parts[0] !== "ui") return null;
  return { sessionId: parts[1]!, action: parts[2]! };
}