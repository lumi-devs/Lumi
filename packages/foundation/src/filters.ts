const InvitePattern =
  /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-z0-9-]+)/gi;
const LinkPattern = /https?:\/\/[^\s<>]+/gi;
const WordPattern = /[\p{L}\p{N}]+/gu;

export function findInvites(text: string): string[] {
  return [...text.matchAll(InvitePattern)].map((match) => match[1] ?? "");
}

export function findLinks(text: string): string[] {
  return [...text.matchAll(LinkPattern)].map((match) => match[0]);
}

export function isHostAllowed(
  url: string,
  allowlist: readonly string[],
): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowlist.some((entry) => {
      const allowed = entry.toLowerCase().replace(/^https?:\/\//, "");
      return host === allowed || host.endsWith(`.${allowed}`);
    });
  } catch {
    return false;
  }
}

export function countZalgo(text: string): number {
  let count = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const combining =
      (code >= 0x0300 && code <= 0x036f) ||
      (code >= 0x0483 && code <= 0x0489) ||
      (code >= 0x1ab0 && code <= 0x1aff) ||
      (code >= 0x1dc0 && code <= 0x1dff) ||
      (code >= 0x20d0 && code <= 0x20ff) ||
      (code >= 0xfe20 && code <= 0xfe2f);
    if (combining) count += 1;
  }
  return count;
}

export function similarity(a: string, b: string): number {
  const left = new Set(a.toLowerCase().match(WordPattern) ?? []);
  const right = new Set(b.toLowerCase().match(WordPattern) ?? []);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

export interface MentionCounts {
  readonly users: { readonly size: number };
  readonly roles: { readonly size: number };
}

export function countMentions(mentions: MentionCounts): number {
  return mentions.users.size + mentions.roles.size;
}
