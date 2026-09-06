import { userMention } from "@discordjs/formatters";
import { Emojis } from "#lib/utilities/assets.js";
import { makeInfoCard, makeSuccessCard } from "#lib/utilities/cards.js";
import { renderTemplate } from "#lib/utilities/template.js";

export interface WelcomeTemplateVars {
  user: string;
  username: string;
  nickname: string;
  server: string;
  memberCount: number;
}

export const WelcomePlaceholders = [
  "user",
  "username",
  "nickname",
  "server",
  "memberCount",
  "memberNumber",
] as const;

export function templateVarsFor(
  memberId: string,
  username: string,
  nickname: string | null,
  serverName: string,
  memberCount: number,
): WelcomeTemplateVars {
  return {
    user: userMention(memberId),
    username,
    nickname: nickname ?? username,
    server: serverName,
    memberCount,
  };
}

export function renderWelcomeTemplate(
  template: string,
  vars: WelcomeTemplateVars,
): string {
  return renderTemplate(template, {
    user: vars.user,
    username: vars.username,
    nickname: vars.nickname,
    server: vars.server,
    memberCount: String(vars.memberCount),
    memberNumber: String(vars.memberCount),
  });
}

export function buildWelcomeCard(body: string, autoRoleLine?: string) {
  return makeSuccessCard(
    `${Emojis.Wave} Welcome`,
    body,
    autoRoleLine ? { footer: autoRoleLine } : undefined,
  );
}

export function buildGoodbyeCard(body: string) {
  return makeInfoCard("Member left", body);
}

export function buildDmWelcomeCard(serverName: string, body: string) {
  return makeInfoCard(`${Emojis.Wave} Welcome to ${serverName}`, body);
}
