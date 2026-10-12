const UrlRe = /https?:\/\/[^\s/<>"']+/gi;
const InviteRe = /(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/([A-Za-z0-9-]+)/gi;
const SmartQuotes: Array<[RegExp, string]> = [
  [/[\u2018\u2019]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
];
const SpoilerRe = /\|\|/g;

export function filterUrls(text: string): string[] {
  return text.match(UrlRe) ?? [];
}

export function filterInvites(text: string): string[] {
  return [...text.matchAll(InviteRe)].map((m) => m[1]!);
}

export function filterMassMentions(text: string): { here: boolean; everyone: boolean; roleIds: string[] } {
  return {
    here: text.includes("@here"),
    everyone: text.includes("@everyone"),
    roleIds: [...text.matchAll(/<@&(\d+)>/g)].map((m) => m[1]!),
  };
}

export function normalizeSmartquotes(text: string): string {
  let out = text;
  for (const [re, replacement] of SmartQuotes) out = out.replace(re, replacement);
  return out;
}

export function escapeSpoilers(text: string): string {
  return text.replace(SpoilerRe, "\\|\\|");
}

export function escapeSpoilersAndMassMentions(text: string): string {
  return escapeSpoilers(text).replace(/@(here|everyone)/g, "@\u200b$1");
}
