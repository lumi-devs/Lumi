import { userMention } from "@discordjs/formatters";
import type { Guild } from "discord.js";
import { container } from "@sapphire/framework";
import { clampMessageDocumentV2, type MessageDocumentV2 } from "@lumi/contracts";
import { Emojis } from "#lib/utilities/assets.js";
import { makeInfoCard, type CardReply } from "#lib/utilities/cards.js";
import {
  MessageTemplateDocs,
  renderMessageContent,
  splitOnSeparator,
  type MessageButton,
} from "#lib/message-content.js";
import { renderTemplate } from "#lib/utilities/template.js";
import { renderMessageBlocksV2 } from "#lib/utilities/message-blocks-v2.js";
import { logError } from "#lib/utilities/errors.js";
import { toStringArray } from "#lib/module-system/Module.js";

export interface WelcomeTemplateVars {
  user: string;
  userId: string;
  username: string;
  nickname: string;
  userAvatarUrl: string;
  server: string;
  serverId: string;
  serverIconUrl: string;
  memberCount: number;
}

export function templateVarsFor(
  memberId: string,
  username: string,
  nickname: string | null,
  userAvatarUrl: string,
  serverName: string,
  serverId: string,
  serverIconUrl: string | null,
  memberCount: number,
): WelcomeTemplateVars {
  return {
    user: userMention(memberId),
    userId: memberId,
    username,
    nickname: nickname ?? username,
    userAvatarUrl,
    server: serverName,
    serverId,
    serverIconUrl: serverIconUrl ?? "",
    memberCount,
  };
}

function welcomeTemplateVarsRecord(
  vars: WelcomeTemplateVars,
): Record<string, string> {
  return {
    user: vars.user,
    userId: vars.userId,
    username: vars.username,
    nickname: vars.nickname,
    userAvatarUrl: vars.userAvatarUrl,
    server: vars.server,
    serverId: vars.serverId,
    serverIconUrl: vars.serverIconUrl,
    memberCount: String(vars.memberCount),
    memberNumber: String(vars.memberCount),
  };
}

export function renderWelcomeTemplate(
  template: string,
  vars: WelcomeTemplateVars,
): string {
  return renderTemplate(template, welcomeTemplateVarsRecord(vars));
}

export interface WelcomeCardRich {
  accentColor?: string | null;
  thumbnailUrl?: string | null;
  imageUrls?: string[];
  footer?: string | null;
  buttons?: MessageButton[];
}

export function buildWelcomeCard(
  body: string,
  autoRoleLine?: string,
  rich?: WelcomeCardRich,
): CardReply {
  return renderMessageContent(
    {
      text: body,
      accentColor: rich?.accentColor ?? undefined,
      thumbnailUrl: rich?.thumbnailUrl ?? undefined,
      imageUrls: rich?.imageUrls,
      footer: rich?.footer ?? autoRoleLine ?? undefined,
      buttons: rich?.buttons,
    },
    {},
    `${Emojis.Wave} Welcome`,
  );
}

export function buildGoodbyeCard(body: string): CardReply {
  return makeInfoCard("Member left", splitOnSeparator(body));
}

export interface WelcomeModuleConfig {
  welcomeEnabled: boolean;
  welcomeChannel: string | null;
  welcomeTemplate: string;
  welcomeAccentColor: string | null;
  welcomeThumbnailUrl: string | null;
  welcomeImageUrls: string[];
  welcomeFooter: string | null;
  welcomeRichContent: MessageDocumentV2;
  goodbyeEnabled: boolean;
  goodbyeChannel: string | null;
  goodbyeTemplate: string;
  goodbyeRichContent: MessageDocumentV2;
  autoRoles: string[];
  dmWelcomeEnabled: boolean;
  dmWelcomeTemplate: string;
}

export const WelcomeDefaults = {
  welcomeEnabled: true,
  welcomeTemplate: "Welcome {user} to {server}! You are member #{memberCount}.",
  welcomeImageUrls: [],
  goodbyeEnabled: false,
  goodbyeTemplate: "{username} has left {server}.",
  dmWelcomeEnabled: false,
  dmWelcomeTemplate: "Welcome to {server}, {username}!",
} as const;

export const WelcomeTemplateDocs = MessageTemplateDocs;
export const GoodbyeTemplateDocs = MessageTemplateDocs;
export const DmTemplateDocs = MessageTemplateDocs;

export function renderWelcomeCard(
  config: WelcomeModuleConfig,
  vars: WelcomeTemplateVars,
): CardReply {
  if (config.welcomeRichContent.blocks.length > 0) {
    return renderMessageBlocksV2(config.welcomeRichContent, welcomeTemplateVarsRecord(vars));
  }
  const autoRoleLine =
    config.autoRoles.length > 0
      ? `Auto-role${config.autoRoles.length === 1 ? "" : "s"}: ${config.autoRoles.map((id) => `<@&${id}>`).join(" ")}`
      : undefined;
  return buildWelcomeCard(renderWelcomeTemplate(config.welcomeTemplate, vars), autoRoleLine, {
    accentColor: config.welcomeAccentColor,
    thumbnailUrl: config.welcomeThumbnailUrl,
    imageUrls: config.welcomeImageUrls,
    footer: config.welcomeFooter,
  });
}

export function renderGoodbyeCard(
  config: WelcomeModuleConfig,
  vars: WelcomeTemplateVars,
): CardReply {
  if (config.goodbyeRichContent.blocks.length > 0) {
    return renderMessageBlocksV2(config.goodbyeRichContent, welcomeTemplateVarsRecord(vars));
  }
  return buildGoodbyeCard(renderWelcomeTemplate(config.goodbyeTemplate, vars));
}

export function buildDmWelcomeCard(serverName: string, body: string): CardReply {
  return makeInfoCard(`${Emojis.Wave} Welcome to ${serverName}`, splitOnSeparator(body));
}

export async function sendWelcomeCard(
  guild: Guild,
  channelId: string,
  card: CardReply,
  context: string,
): Promise<boolean> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable()) return false;
  const sent = await channel.send(card).catch((err: unknown) => {
    logError(context, err);
    return null;
  });
  return sent !== null;
}

async function getConfigValue(
  guildId: string,
  key: string,
): Promise<unknown> {
  return container.db.config.getModuleConfig(guildId, "welcome", key);
}

export async function loadWelcomeConfig(
  guildId: string,
): Promise<WelcomeModuleConfig> {
  const [
    welcomeEnabled,
    welcomeChannel,
    welcomeTemplate,
    welcomeAccentColor,
    welcomeThumbnailUrl,
    welcomeImageUrls,
    welcomeFooter,
    welcomeRichContent,
    goodbyeEnabled,
    goodbyeChannel,
    goodbyeTemplate,
    goodbyeRichContent,
    autoRoles,
    dmWelcomeEnabled,
    dmWelcomeTemplate,
  ] = await Promise.all([
    getConfigValue(guildId, "welcomeEnabled"),
    getConfigValue(guildId, "welcomeChannel"),
    getConfigValue(guildId, "welcomeTemplate"),
    getConfigValue(guildId, "welcomeAccentColor"),
    getConfigValue(guildId, "welcomeThumbnailUrl"),
    getConfigValue(guildId, "welcomeImageUrls"),
    getConfigValue(guildId, "welcomeFooter"),
    getConfigValue(guildId, "welcomeRichContent"),
    getConfigValue(guildId, "goodbyeEnabled"),
    getConfigValue(guildId, "goodbyeChannel"),
    getConfigValue(guildId, "goodbyeTemplate"),
    getConfigValue(guildId, "goodbyeRichContent"),
    getConfigValue(guildId, "autoRoles"),
    getConfigValue(guildId, "dmWelcomeEnabled"),
    getConfigValue(guildId, "dmWelcomeTemplate"),
  ]);

  return {
    welcomeEnabled:
      typeof welcomeEnabled === "boolean"
        ? welcomeEnabled
        : WelcomeDefaults.welcomeEnabled,
    welcomeChannel:
      typeof welcomeChannel === "string" ? welcomeChannel : null,
    welcomeTemplate:
      typeof welcomeTemplate === "string" && welcomeTemplate.length > 0
        ? welcomeTemplate
        : WelcomeDefaults.welcomeTemplate,
    welcomeAccentColor:
      typeof welcomeAccentColor === "string" && welcomeAccentColor.length > 0
        ? welcomeAccentColor
        : null,
    welcomeThumbnailUrl:
      typeof welcomeThumbnailUrl === "string" && welcomeThumbnailUrl.length > 0
        ? welcomeThumbnailUrl
        : null,
    welcomeImageUrls: toStringArray(welcomeImageUrls),
    welcomeFooter:
      typeof welcomeFooter === "string" && welcomeFooter.length > 0
        ? welcomeFooter
        : null,
    welcomeRichContent: clampMessageDocumentV2(welcomeRichContent),
    goodbyeEnabled:
      typeof goodbyeEnabled === "boolean"
        ? goodbyeEnabled
        : WelcomeDefaults.goodbyeEnabled,
    goodbyeChannel:
      typeof goodbyeChannel === "string" ? goodbyeChannel : null,
    goodbyeTemplate:
      typeof goodbyeTemplate === "string" && goodbyeTemplate.length > 0
        ? goodbyeTemplate
        : WelcomeDefaults.goodbyeTemplate,
    goodbyeRichContent: clampMessageDocumentV2(goodbyeRichContent),
    autoRoles: toStringArray(autoRoles),
    dmWelcomeEnabled:
      typeof dmWelcomeEnabled === "boolean"
        ? dmWelcomeEnabled
        : WelcomeDefaults.dmWelcomeEnabled,
    dmWelcomeTemplate:
      typeof dmWelcomeTemplate === "string" && dmWelcomeTemplate.length > 0
        ? dmWelcomeTemplate
        : WelcomeDefaults.dmWelcomeTemplate,
  };
}
