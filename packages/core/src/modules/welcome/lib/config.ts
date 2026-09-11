import { container } from "@sapphire/framework";
import { toStringArray } from "#lib/module-system/Module.js";
import { MessageTemplateDocs } from "#lib/message-content.js";
import { clampMessageDocumentV2, type MessageDocumentV2 } from "@lumi/contracts";

export interface WelcomeActionButton {
  label: string;
  url: string;
}

export interface WelcomeModuleConfig {
  welcomeEnabled: boolean;
  welcomeChannel: string | null;
  welcomeTemplate: string;
  welcomeAccentColor: string | null;
  welcomeThumbnailUrl: string | null;
  welcomeImageUrls: string[];
  welcomeFooter: string | null;
  welcomeActionButtons: WelcomeActionButton[];
  welcomeRichContent: MessageDocumentV2;
  goodbyeEnabled: boolean;
  goodbyeChannel: string | null;
  goodbyeTemplate: string;
  autoRoles: string[];
  dmWelcomeEnabled: boolean;
  dmWelcomeTemplate: string;
}

export const WelcomeDefaults = {
  welcomeEnabled: true,
  welcomeTemplate: "Welcome {user} to {server}! You are member #{memberCount}.",
  welcomeImageUrls: [],
  welcomeActionButtons: [],
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

function toActionButtons(value: unknown): WelcomeActionButton[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): WelcomeActionButton[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const { label, url } = entry as Record<string, unknown>;
    if (typeof label !== "string" || typeof url !== "string") return [];
    if (label.length === 0 || url.length === 0) return [];
    return [{ label, url }];
  });
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
    welcomeActionButtons,
    welcomeRichContent,
    goodbyeEnabled,
    goodbyeChannel,
    goodbyeTemplate,
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
    getConfigValue(guildId, "welcomeActionButtons"),
    getConfigValue(guildId, "welcomeRichContent"),
    getConfigValue(guildId, "goodbyeEnabled"),
    getConfigValue(guildId, "goodbyeChannel"),
    getConfigValue(guildId, "goodbyeTemplate"),
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
    welcomeActionButtons: toActionButtons(welcomeActionButtons),
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
