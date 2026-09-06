import { container } from "@sapphire/framework";
import { toStringArray } from "#lib/module-system/Module.js";

export interface WelcomeModuleConfig {
  welcomeEnabled: boolean;
  welcomeChannel: string | null;
  welcomeTemplate: string;
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
  goodbyeEnabled: false,
  goodbyeTemplate: "{username} has left {server}.",
  dmWelcomeEnabled: false,
  dmWelcomeTemplate: "Welcome to {server}, {username}!",
} as const;

const PlaceholderDocs =
  "Placeholders: {user} mention, {username}, {nickname}, {server}, {memberCount} (alias {memberNumber}). Unknown placeholders are left as-is.";

export const WelcomeTemplateDocs = PlaceholderDocs;
export const GoodbyeTemplateDocs = PlaceholderDocs;
export const DmTemplateDocs = PlaceholderDocs;

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
