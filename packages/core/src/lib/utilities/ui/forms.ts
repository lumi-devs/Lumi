import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { encodeNavCustomId } from "./navigation.js";
import type { View, ViewContext, CardReply } from "./types.js";

export interface CheckboxFormOption {
  id: string;
  label: string;
  description?: string;
}

export interface CheckboxFormOptions {
  id: string;
  label: string;
  title: string;
  description?: string;
  options: CheckboxFormOption[];
  minValues?: number;
  maxValues?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  footer?: string;
}

export interface RadioFormOptions {
  id: string;
  label: string;
  title: string;
  description?: string;
  options: CheckboxFormOption[];
  confirmLabel?: string;
  cancelLabel?: string;
  footer?: string;
}

export function createCheckboxFormPage(options: CheckboxFormOptions): View {
  return {
    id: options.id,
    label: options.label,
    render: (ctx: ViewContext): CardReply => {
      const c = new ContainerBuilder();
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${options.title}`),
      );
      if (options.description) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(options.description),
        );
      }
      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      );

      const lines: string[] = [];
      for (const opt of options.options) {
        const checked = opt.id ? "[x]" : "[ ]";
        const desc = opt.description ? ` - ${opt.description}` : "";
        lines.push(`${checked} **${opt.label}**${desc}`);
      }
      if (lines.length > 0) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(lines.join("\n")),
        );
      }

      const btnRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();
      if (options.cancelLabel) {
        btnRow.addComponents(
          new ButtonBuilder()
            .setCustomId(encodeNavCustomId(ctx.sessionId, "back"))
            .setLabel(options.cancelLabel)
            .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
            .setStyle(ButtonStyle.Secondary),
        );
      }
      if (options.confirmLabel) {
        btnRow.addComponents(
          new ButtonBuilder()
            .setCustomId(encodeNavCustomId(ctx.sessionId, "confirm"))
            .setLabel(options.confirmLabel)
            .setEmoji(Emojis.parse(Emojis.CHECK))
            .setStyle(ButtonStyle.Success),
        );
      }
      if (btnRow.components.length > 0) {
        c.addActionRowComponents((builder) => {
          builder.addComponents(...btnRow.components);
          return builder;
        });
      }

      if (options.footer) {
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
        );
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ${options.footer}`),
        );
      }

      return {
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [c],
        allowedMentions: { parse: [] },
      };
    },
  };
}

export function createRadioFormPage(options: RadioFormOptions): View {
  return {
    id: options.id,
    label: options.label,
    render: (ctx: ViewContext): CardReply => {
      const c = new ContainerBuilder();
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${options.title}`),
      );
      if (options.description) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(options.description),
        );
      }
      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      );

      const lines: string[] = [];
      for (const opt of options.options) {
        lines.push(`( ) **${opt.label}**${opt.description ? ` - ${opt.description}` : ""}`);
      }
      if (lines.length > 0) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(lines.join("\n")),
        );
      }

      const btnRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();
      if (options.cancelLabel) {
        btnRow.addComponents(
          new ButtonBuilder()
            .setCustomId(encodeNavCustomId(ctx.sessionId, "back"))
            .setLabel(options.cancelLabel)
            .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
            .setStyle(ButtonStyle.Secondary),
        );
      }
      if (options.confirmLabel) {
        btnRow.addComponents(
          new ButtonBuilder()
            .setCustomId(encodeNavCustomId(ctx.sessionId, "confirm"))
            .setLabel(options.confirmLabel)
            .setEmoji(Emojis.parse(Emojis.CHECK))
            .setStyle(ButtonStyle.Success),
        );
      }
      if (btnRow.components.length > 0) {
        c.addActionRowComponents((builder) => {
          builder.addComponents(...btnRow.components);
          return builder;
        });
      }

      if (options.footer) {
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
        );
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ${options.footer}`),
        );
      }

      return {
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [c],
        allowedMentions: { parse: [] },
      };
    },
  };
}
