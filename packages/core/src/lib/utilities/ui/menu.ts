import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { encodeNavCustomId } from "./navigation.js";
import type { View, ViewContext, MenuEntry, CardReply } from "./types.js";
import {
  createCategorySubmenuRow,
  createChannelSelectMenuRow,
  createRoleSelectMenuRow,
  createUserSelectMenuRow,
  type CategoryTab,
} from "../panels.js";

export interface MenuPageOptions {
  id: string;
  label: string;
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  entries: MenuEntry[];
  columns?: 1 | 2;
  footer?: string;
  categories?: CategoryTab[];
  activeCategoryId?: string;
  showBackButton?: boolean;
  backButtonLabel?: string;
  backButtonCustomId?: string;
}

export interface SelectMenuPageOptions {
  id: string;
  label: string;
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  entries: MenuEntry[];
  placeholder?: string;
  footer?: string;
  type?: "string" | "user" | "role" | "channel" | "mentionable";
  minValues?: number;
  maxValues?: number;
}

export function createMenuPage(options: MenuPageOptions): View {
  return {
    id: options.id,
    label: options.label,
    render: (ctx: ViewContext): CardReply => {
      const c = new ContainerBuilder();

      if (options.breadcrumbs && options.breadcrumbs.length > 0) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(options.breadcrumbs.map((cb, idx) => idx === options.breadcrumbs!.length - 1 ? `**${cb}**` : `\`${cb}\``).join(" ❯ ")),
        );
      }

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${options.title}`),
      );
      if (options.subtitle) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ${options.subtitle}`),
        );
      }
      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      );

      // Submenu category tabs selector if categories provided
      if (options.categories && options.categories.length > 0) {
        const catRow = createCategorySubmenuRow(
          encodeNavCustomId(ctx.sessionId, "submenu"),
          options.categories,
          options.activeCategoryId,
          "Switch Submenu Section…",
        );
        c.addActionRowComponents((builder) => {
          builder.addComponents(...catRow.components);
          return builder;
        });
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
        );
      }

      const cols = options.columns ?? 1;
      const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

      if (cols === 2) {
        for (let i = 0; i < options.entries.length; i += 2) {
          const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
          const a = options.entries[i];
          const b = options.entries[i + 1];
          if (a) {
            const btn = new ButtonBuilder()
              .setCustomId(encodeNavCustomId(ctx.sessionId, "nav", a.id))
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(a.disabled ?? false);
            if (a.emoji) btn.setEmoji(Emojis.parse(a.emoji));
            const label = a.count !== undefined ? `${a.label} (${a.count})` : a.label;
            btn.setLabel(label);
            row.addComponents(btn);
          }
          if (b) {
            const btn = new ButtonBuilder()
              .setCustomId(encodeNavCustomId(ctx.sessionId, "nav", b.id))
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(b.disabled ?? false);
            if (b.emoji) btn.setEmoji(Emojis.parse(b.emoji));
            const label = b.count !== undefined ? `${b.label} (${b.count})` : b.label;
            btn.setLabel(label);
            row.addComponents(btn);
          }
          if (a || b) rows.push(row);
        }
      } else {
        for (const entry of options.entries) {
          const btn = new ButtonBuilder()
            .setCustomId(encodeNavCustomId(ctx.sessionId, "nav", entry.id))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(entry.disabled ?? false);
          if (entry.emoji) btn.setEmoji(Emojis.parse(entry.emoji));
          const label = entry.count !== undefined ? `${entry.label} (${entry.count})` : entry.label;
          btn.setLabel(label);
          rows.push(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(btn),
          );
        }
      }

      for (const row of rows) {
        c.addActionRowComponents((builder) => {
          builder.addComponents(...row.components);
          return builder;
        });
      }

      // Render single Back navigation button for non-hub sub-pages
      if (options.showBackButton !== false && options.id !== "hub") {
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
        );
        const backNavRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(options.backButtonCustomId ?? encodeNavCustomId(ctx.sessionId, "nav", "back"))
            .setLabel(options.backButtonLabel ?? "← Back")
            .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
            .setStyle(ButtonStyle.Secondary),
        );
        c.addActionRowComponents((builder) => {
          builder.addComponents(...backNavRow.components);
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
        flags: MessageFlags.IsComponentsV2,
        components: [c],
        allowedMentions: { parse: [] },
      };
    },
  };
}

export function createSelectMenuPage(options: SelectMenuPageOptions): View {
  return {
    id: options.id,
    label: options.label,
    render: (ctx: ViewContext): CardReply => {
      const c = new ContainerBuilder();

      if (options.breadcrumbs && options.breadcrumbs.length > 0) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(options.breadcrumbs.map((cb, idx) => idx === options.breadcrumbs!.length - 1 ? `**${cb}**` : `\`${cb}\``).join(" ❯ ")),
        );
      }

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${options.title}`),
      );
      if (options.subtitle) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ${options.subtitle}`),
        );
      }
      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      );

      const menuType = options.type ?? "string";
      const customId = encodeNavCustomId(ctx.sessionId, "select");

      if (menuType === "user") {
        const row = createUserSelectMenuRow({
          customId,
          placeholder: options.placeholder ?? "Select a user…",
          minValues: options.minValues,
          maxValues: options.maxValues,
        });
        c.addActionRowComponents((builder) => {
          builder.addComponents(...row.components);
          return builder;
        });
      } else if (menuType === "role") {
        const row = createRoleSelectMenuRow({
          customId,
          placeholder: options.placeholder ?? "Select a role…",
          minValues: options.minValues,
          maxValues: options.maxValues,
        });
        c.addActionRowComponents((builder) => {
          builder.addComponents(...row.components);
          return builder;
        });
      } else if (menuType === "channel") {
        const row = createChannelSelectMenuRow({
          customId,
          placeholder: options.placeholder ?? "Select a channel…",
          minValues: options.minValues,
          maxValues: options.maxValues,
        });
        c.addActionRowComponents((builder) => {
          builder.addComponents(...row.components);
          return builder;
        });
      } else {
        const menuOptions = options.entries.map((entry) => {
          const opt = new StringSelectMenuOptionBuilder()
            .setLabel(entry.count !== undefined ? `${entry.label} (${entry.count})` : entry.label)
            .setValue(entry.id);
          if (entry.description) opt.setDescription(entry.description);
          if (entry.emoji) opt.setEmoji(Emojis.parse(entry.emoji));
          return opt;
        });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(options.placeholder ?? "Select an option…")
          .addOptions(menuOptions);

        if (options.minValues !== undefined) selectMenu.setMinValues(options.minValues);
        if (options.maxValues !== undefined) selectMenu.setMaxValues(options.maxValues);

        c.addActionRowComponents((builder) => {
          builder.addComponents(selectMenu);
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
        flags: MessageFlags.IsComponentsV2,
        components: [c],
        allowedMentions: { parse: [] },
      };
    },
  };
}

export function createSubNavRow(
  sessionId: string,
  entries: { id: string; label: string; emoji?: string; default?: boolean }[],
  placeholder = "Navigate…",
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  const options = entries.map((e) => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(e.label)
      .setValue(e.id);
    if (e.emoji) opt.setEmoji(Emojis.parse(e.emoji));
    if (e.default) opt.setDefault(true);
    return opt;
  });

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(encodeNavCustomId(sessionId, "select"))
      .setPlaceholder(placeholder)
      .addOptions(options),
  );
}