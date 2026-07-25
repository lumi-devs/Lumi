import type { User, Message } from "discord.js";
import { PermissionsBitField } from "discord.js";
import { isGuildBasedChannel } from "@sapphire/discord.js-utilities";
import { checkModulesEnabled } from "#lib/module-check.js";

// audit.ts
export function formatAuditReason(
  actor: User,
  reason: string | null,
  maxLen = 512,
): string {
  const prefix = `[${actor.tag} | ${actor.id}] `;
  return (prefix + (reason ?? "No reason provided.")).slice(0, maxLen);
}

// branding.ts
export const LumiInfo = {
  version: "2.1.1",
  codename: "Elysian",
  tagline: "The next-generation modular Discord command center",
  inception: new Date("2026-07-11T07:50:00Z"),
  github: "https://github.com/lumi-devs/lumi",
  getAgeInDays(): number {
    const diff = Date.now() - this.inception.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  },
};

// formatting.ts
export { cutText as truncate } from "@sapphire/utilities";
export { escapeMarkdown } from "@discordjs/formatters";

/**
 * Formats an unknown ID into a string. Returns 'unknown' if the ID is falsy.
 */
export const fmtId = (id: unknown): string => (id ? String(id) : "unknown");

// listeners.ts
export async function isModuleEnabled(
  guildId: string,
  module: string,
): Promise<boolean> {
  const states = await checkModulesEnabled(guildId, [module]);
  return states.get(module) ?? false;
}

export function canSendMessages(message: Message<true>): boolean {
  if (!isGuildBasedChannel(message.channel)) return false;

  const { me } = message.guild.members;
  if (!me) return false;
  return (
    message.channel
      .permissionsFor(me)
      ?.has(PermissionsBitField.Flags.SendMessages) ?? false
  );
}
