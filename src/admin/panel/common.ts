import {
  type CardOptions,
  type CardReply,
  createActionButton,
  row,
  type Tab,
  tabRow,
} from "@lumi/ui";
import {
  type ActionRowBuilder,
  type AnySelectMenuInteraction,
  type ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
} from "discord.js";

export type HubView = "home" | "modules" | "settings" | "permits" | "addons";

export type HubInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

export type MessageModalSubmit = ModalSubmitInteraction & {
  update(reply: CardReply): Promise<unknown>;
};

const HubTabs: Tab[] = [
  { id: "home", label: "Overview", emoji: "🏠" },
  { id: "modules", label: "Modules", emoji: "⚙️" },
  { id: "permits", label: "Permissions", emoji: "🛡️" },
  { id: "settings", label: "Settings", emoji: "🏰" },
  { id: "addons", label: "Add-ons", emoji: "📦" },
];

export function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function navigationRow(
  active: HubView,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return tabRow("lumi", HubTabs, active);
}

/** Secondary "back" button every sub-panel uses on its last action row. */
export function backButton(
  customId: string,
  label = "Back",
  emoji: string | null = "⬅️",
): ButtonBuilder {
  return createActionButton({
    customId,
    label,
    ...(emoji === null ? {} : { emoji }),
    style: ButtonStyle.Secondary,
  });
}

export function panelOptions(
  interaction: HubInteraction,
  active: HubView,
  breadcrumbs: string[],
  extraRows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [],
  footer?: string,
  showTabs = true,
): CardOptions {
  return {
    breadcrumbs,
    thumbnailUrl: interaction.guild?.iconURL({ size: 128 }) ?? undefined,
    footer,
    actionRows: [
      ...(showTabs ? [navigationRow(active)] : []),
      ...extraRows,
    ],
    separatorAboveActionRows: true,
  };
}

export function pageRow(prefix: string, page: number, totalPages: number) {
  return row(
    createActionButton({
      customId: `${prefix}:${page - 1}`,
      label: "Previous",
      emoji: "◀️",
      style: ButtonStyle.Secondary,
      disabled: page <= 0,
    }),
    createActionButton({
      customId: `${prefix}:${page + 1}`,
      label: "Next",
      emoji: "▶️",
      style: ButtonStyle.Secondary,
      disabled: page >= totalPages - 1,
    }),
  );
}
