import { container } from "@sapphire/framework";
import { toStringArray } from "#lib/module-system/Module.js";
import { MessageTemplateDocs } from "#lib/message-content.js";
import { clampMessageDocumentV2, type MessageDocumentV2 } from "@lumi/contracts";

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
