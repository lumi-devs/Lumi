import { z } from "zod";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { splitOnSeparator } from "@lumi/contracts";
import { makeCard, type CardReply } from "@lumi/lib/ui/cards.js";
import { resolveCardColor } from "@lumi/lib/ui/palette.js";
import { renderTemplate } from "@lumi/lib/utilities/template.js";

export interface MessageButton {
  label: string;
  url: string;
  emoji?: string;
}

export interface MessageContent {
  text: string;
  accentColor?: string;
  imageUrls?: string[];
  thumbnailUrl?: string;
  footer?: string;
  buttons?: MessageButton[];
}

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const HttpUrlSchema = z.string().url();

const MessageButtonSchema = z.object({
  label: z.string().min(1).max(80),
  url: HttpUrlSchema,
  emoji: z.string().min(1).max(100).optional(),
});

export const MessageContentSchema = z.object({
  text: z.string().min(1),
  accentColor: HexColorSchema.optional(),
  imageUrls: z.array(HttpUrlSchema).max(10).optional(),
  thumbnailUrl: HttpUrlSchema.optional(),
  footer: z.string().max(2000).optional(),
  buttons: z.array(MessageButtonSchema).max(5).optional(),
});

const HexColorPattern = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HexColorPattern.test(value);
}

export function parseHexColor(
  color: string | null | undefined,
): number | undefined {
  if (!isHexColor(color)) return undefined;
  return Number.parseInt(color.slice(1), 16);
}

export interface MessageTemplateVar {
  name: string;
  example: string;
  description: string;
}

export const MessageTemplateVars: MessageTemplateVar[] = [
  { name: "user", example: "<@123>", description: "Mention of the member" },
  {
    name: "userId",
    example: "123456789012345678",
    description: "The member's raw Discord user ID",
  },
  { name: "username", example: "alex", description: "The member's username" },
  {
    name: "nickname",
    example: "Al",
    description: "The member's server nickname, falling back to username",
  },
  {
    name: "userAvatarUrl",
    example: "https://cdn.discordapp.com/embed/avatars/0.png",
    description: "The member's avatar image URL",
  },
  { name: "server", example: "Acme", description: "The server's name" },
  {
    name: "serverId",
    example: "987654321098765432",
    description: "The server's raw Discord guild ID",
  },
  {
    name: "serverIconUrl",
    example: "https://cdn.discordapp.com/embed/avatars/1.png",
    description: "The server's icon image URL",
  },
  {
    name: "memberCount",
    example: "42",
    description: "Current member count (alias memberNumber)",
  },
  { name: "memberNumber", example: "42", description: "Alias of memberCount" },
];

export const MessageTemplateDocs =
  "Placeholders: {user} mention, {userId}, {username}, {nickname}, {userAvatarUrl}, {server}, {serverId}, {serverIconUrl}, {memberCount} (alias {memberNumber}). Unknown placeholders are left as-is. A line containing only --- inserts a divider.";

export function renderMessageContent(
  content: MessageContent,
  vars: Record<string, string>,
  title = "Message",
): CardReply {
  const body = splitOnSeparator(renderTemplate(content.text, vars));
  const footer = content.footer ? renderTemplate(content.footer, vars) : undefined;
  const color = parseHexColor(content.accentColor) ?? resolveCardColor("info");
  const headerImages = (content.imageUrls ?? []).filter(
    (url) => typeof url === "string" && url.length > 0,
  ).slice(0, 10);
  const buttons = (content.buttons ?? [])
    .filter((b) => b && b.label.length > 0 && b.url.length > 0)
    .slice(0, 5);
  const actionRows =
    buttons.length > 0
      ? [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            ...buttons.map((b) => {
              const btn = new ButtonBuilder()
                .setLabel(b.label.slice(0, 80))
                .setStyle(ButtonStyle.Link)
                .setURL(b.url);
              return b.emoji ? btn.setEmoji({ name: b.emoji }) : btn;
            }),
          ),
        ]
      : undefined;
  return makeCard(color, title, body, {
    headerImages,
    thumbnailUrl: content.thumbnailUrl,
    footer,
    actionRows,
  });
}
