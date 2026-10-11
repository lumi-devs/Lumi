// @ts-expect-error - ahocorasick does not provide type declarations
import AhoCorasick from "ahocorasick";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { MaxRegexLength } from "#src/lib/regex-worker/Validate.js";

interface AhoMatcher {
  search(text: string): Array<[number, string[]]>;
}

export interface FilterHit {
  rule: "term" | "regex" | "invite" | "link" | "mentions" | "caps" | "phish";

  detail: string;
}

export interface RuleConfig {
  terms: string[];
  regexRules: string[];
  blockInvites: boolean;

  inviteAllowlist: string[];
  blockLinks: boolean;

  linkAllowlist: string[];

  maxMentions: number;

  maxCapsPercent: number;

  capsMinLength: number;
}

export interface CompiledRules {
  matcher: AhoMatcher | null;

  regexSources: string[];
  config: RuleConfig;
}

export const DefaultCapsMinLength = 12;

export const DefaultWarnMessage =
  "{user}, your message was removed for containing {reason}.";

const InviteRe =
  /(?:discord\.(?:gg|com\/invite)|discordapp\.com\/invite)\/([\w-]+)/i;

const UrlRe = /https?:\/\/([^\s/<>"']+)/gi;

export function screenRegexRules(
  patterns: string[],
  onError?: (pattern: string, reason: string) => void,
): string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    if (pattern.length > MaxRegexLength) {
      onError?.(pattern, `longer than ${MaxRegexLength} chars`);
      continue;
    }
    try {
      new RegExp(pattern, "iu");
      out.push(pattern);
    } catch (err) {
      onError?.(pattern, err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}

const InvisibleRe = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/gu;

function normalizeForMatch(input: string): string {
  return input
    .normalize("NFKD")
    .replace(InvisibleRe, "")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function compileRules(
  config: RuleConfig,
  onRegexError?: (pattern: string, reason: string) => void,
): CompiledRules {
  return {
    matcher:
      config.terms.length > 0
        ? (new AhoCorasick(
            config.terms.map(normalizeForMatch).filter((t) => t.length > 0),
          ) as AhoMatcher)
        : null,
    regexSources: screenRegexRules(config.regexRules, onRegexError),
    config,
  };
}

export function findBlockedInvite(
  content: string,
  allowlist: string[],
): string | null {
  const match = InviteRe.exec(content);
  if (!match?.[1]) return null;
  const code = match[1];
  return allowlist.some((a) => a.toLowerCase() === code.toLowerCase())
    ? null
    : code;
}

export function findBlockedLink(
  content: string,
  allowlist: string[],
): string | null {
  for (const match of content.matchAll(UrlRe)) {
    const host = match[1]?.split(":")[0]?.toLowerCase();
    if (!host) continue;
    const allowed = allowlist.some((domain) => {
      const d = domain.toLowerCase();
      return host === d || host.endsWith(`.${d}`);
    });
    if (!allowed) return host;
  }
  return null;
}

export function capsPercent(content: string): number {
  let letters = 0;
  let upper = 0;
  for (const ch of content) {
    const lower = ch.toLowerCase();
    const upperCh = ch.toUpperCase();
    if (lower === upperCh) continue;
    letters++;
    if (ch === upperCh) upper++;
  }
  return letters === 0 ? 0 : (upper / letters) * 100;
}

export function evaluateTerms(
  rules: CompiledRules,
  content: string,
): FilterHit | null {
  if (!rules.matcher) return null;
  const results = rules.matcher.search(normalizeForMatch(content));
  const term = results[0]?.[1]?.[0];
  return term ? { rule: "term", detail: term } : null;
}

export function evaluateStatic(
  rules: CompiledRules,
  content: string,
  mentionCount: number,
): FilterHit | null {
  const { config } = rules;

  if (config.blockInvites) {
    const code = findBlockedInvite(content, config.inviteAllowlist);
    if (code) return { rule: "invite", detail: code };
  }

  if (config.blockLinks) {
    const host = findBlockedLink(content, config.linkAllowlist);
    if (host) return { rule: "link", detail: host };
  }

  if (config.maxMentions > 0 && mentionCount > config.maxMentions) {
    return {
      rule: "mentions",
      detail: `${mentionCount} mentions (limit ${config.maxMentions})`,
    };
  }

  if (
    config.maxCapsPercent > 0 &&
    content.length >= config.capsMinLength &&
    capsPercent(content) > config.maxCapsPercent
  ) {
    return {
      rule: "caps",
      detail: `${Math.round(capsPercent(content))}% caps (limit ${config.maxCapsPercent}%)`,
    };
  }

  return null;
}

export function evaluate(
  rules: CompiledRules,
  content: string,
  mentionCount: number,
): FilterHit | null {
  return (
    evaluateTerms(rules, content) ??
    evaluateStatic(rules, content, mentionCount)
  );
}

export function getHitReason(t: LumiT, rule: FilterHit["rule"]): string {
  switch (rule) {
    case "term":
      return t("filter:reasonFilteredTerm");
    case "regex":
      return t("filter:reasonFilteredPattern");
    case "invite":
      return t("filter:reasonInviteLink");
    case "link":
      return t("filter:reasonLinkNotAllowed");
    case "mentions":
      return t("filter:reasonTooManyMentions");
    case "caps":
      return t("filter:reasonExcessiveCaps");
    case "phish":
      return t("filter:reasonPhishingLink");
  }
}
