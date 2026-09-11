import { s } from "@sapphire/shapeshift";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import {
  makeCard,
  resolveCardColor,
  type CardReply,
} from "#lib/utilities/cards.js";
import { renderTemplate } from "#lib/utilities/template.js";

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

const HexColorSchema = s.string().regex(/^#[0-9a-fA-F]{6}$/);
const HttpUrlSchema = s.string().url();

export const MessageButtonSchema = s.object({
  label: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(80),
  url: HttpUrlSchema,
  emoji: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(100).optional(),
});

export const MessageContentSchema = s.object({
  text: s.string().lengthGreaterThanOrEqual(1),
  accentColor: HexColorSchema.optional(),
  imageUrls: s.array(HttpUrlSchema).lengthLessThanOrEqual(10).optional(),
  thumbnailUrl: HttpUrlSchema.optional(),
  footer: s.string().lengthLessThanOrEqual(2000).optional(),
  buttons: s.array(MessageButtonSchema).lengthLessThanOrEqual(5).optional(),
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

/** A line consisting of exactly `---` inserts a visual divider — the same
 * marker `buildContainer` already draws between multi-part bodies, just
 * user-triggered instead of automatic. */
const SeparatorLine = /^\s*---\s*$/;

export function splitOnSeparator(text: string): string[] {
  return text.split("\n").reduce<string[]>((parts, line) => {
    if (SeparatorLine.test(line)) {
      parts.push("");
      return parts;
    }
    if (parts.length === 0) parts.push(line);
    else parts[parts.length - 1] += (parts[parts.length - 1] ? "\n" : "") + line;
    return parts;
  }, []);
}

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
