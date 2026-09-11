import { userMention } from "@discordjs/formatters";
import { Emojis } from "#lib/utilities/assets.js";
import {
  makeInfoCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import {
  renderMessageContent,
  splitOnSeparator,
  type MessageButton,
} from "#lib/message-content.js";
import { renderTemplate } from "#lib/utilities/template.js";
import { renderMessageBlocksV2 } from "#lib/utilities/message-blocks-v2.js";
import type { WelcomeModuleConfig } from "./config.js";

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

export function welcomeTemplateVarsRecord(
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

export function buildGoodbyeCard(body: string) {
  return makeInfoCard("Member left", splitOnSeparator(body));
}

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

export function buildDmWelcomeCard(serverName: string, body: string) {
  return makeInfoCard(`${Emojis.Wave} Welcome to ${serverName}`, splitOnSeparator(body));
}
