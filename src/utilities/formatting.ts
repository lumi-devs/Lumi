import { cutText } from "@sapphire/utilities";
import { escapeMarkdown } from "@discordjs/formatters";

export const truncate = (str: string, maxLength: number): string =>
  cutText(str, maxLength);

/**
 * Formats an unknown ID into a string. Returns 'unknown' if the ID is falsy.
 * @param id - The ID to format.
 * @returns The formatted ID string.
 */
export const fmtId = (id: unknown): string => (id ? String(id) : "unknown");

export { escapeMarkdown };
