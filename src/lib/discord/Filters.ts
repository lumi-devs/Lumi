const UrlRe = /https?:\/\/[^\s/<>"']+/gi;

export function filterUrls(text: string): string[] {
  return text.match(UrlRe) ?? [];
}
