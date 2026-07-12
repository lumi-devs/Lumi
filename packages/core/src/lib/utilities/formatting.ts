export { cutText as truncate } from "@sapphire/utilities";
export { escapeMarkdown } from "@discordjs/formatters";

/**
 * Formats an unknown ID into a string. Returns 'unknown' if the ID is falsy.
 */
export const fmtId = (id: unknown): string => (id ? String(id) : "unknown");
