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
import { fitLines } from "./cards.js";
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
      await interaction.deferReply(
        ephemeral ? { flags: MessageFlags.Ephemeral } : {},
      );
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
      const body = slice.length ? fitLines(slice) : "*Nothing here yet.*";

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

