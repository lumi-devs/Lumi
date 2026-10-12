import { AttachmentBuilder } from "discord.js";

export function humanizeList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function escapeMentions(text: string): string {
  return text.replace(/@(here|everyone)/g, "@\u200b$1");
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([*_`~|>])/g, "\\$1");
}

export function* pagify(text: string, pageLength = 2000, delims: readonly string[] = ["\n", " ", ""]): Generator<string> {
  let remaining = text;
  while (remaining.length > pageLength) {
    let cut = -1;
    for (const delim of delims) {
      if (delim === "") {
        cut = pageLength;
        break;
      }
      const idx = remaining.lastIndexOf(delim, pageLength);
      if (idx > 0) {
        cut = idx + delim.length;
        break;
      }
    }
    if (cut <= 0) cut = pageLength;
    yield remaining.slice(0, cut);
    remaining = remaining.slice(cut);
  }
  if (remaining.length > 0) yield remaining;
}

export function textToFile(text: string, filename: string): AttachmentBuilder {
  return new AttachmentBuilder(Buffer.from(text, "utf8"), { name: filename });
}

export function formatPermsList(perms: readonly string[]): string {
  return humanizeList(perms.map((p) => `\`${p}\``));
}
