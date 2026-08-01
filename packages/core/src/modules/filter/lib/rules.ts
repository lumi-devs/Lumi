// @ts-expect-error - ahocorasick does not provide type declarations
import AhoCorasick from "ahocorasick";
import type { LumiT } from "#lib/i18n/index.js";
import { MAX_REGEX_LENGTH } from "#lib/regex-worker/validate.js";

interface AhoMatcher {
  search(text: string): Array<[number, string[]]>;
}

/** Which rule fired and what it matched - drives the warning + log copy. */
export interface FilterHit {
  rule: "term" | "regex" | "invite" | "link" | "mentions" | "caps" | "phish";
  /** The matched term/pattern/code/domain, or a human summary for counters. */
  detail: string;
}

export interface RuleConfig {
  terms: string[];
  regexRules: string[];
  blockInvites: boolean;
  /** Invite codes that are always allowed (e.g. the guild's own). */
  inviteAllowlist: string[];
  blockLinks: boolean;
  /** Domains (and their subdomains) exempt from the link rule. */
  linkAllowlist: string[];
  /** Max user+role mentions per message; 0 disables. */
  maxMentions: number;
  /** Delete when more than this % of letters are uppercase; 0 disables. */
  maxCapsPercent: number;
  /** Messages shorter than this never trip the caps rule. */
  capsMinLength: number;
}

export interface CompiledRules {
  matcher: AhoMatcher | null;
  /**
   * Validated pattern sources, *not* `RegExp` objects: guild regex only ever
   * runs in the regex worker, so nothing here can backtrack on the event loop.
   */
  regexSources: string[];
  config: RuleConfig;
}

/** Default for `capsMinLength` - avoids "OK" tripping the caps rule. */
export const DEFAULT_CAPS_MIN_LENGTH = 12;

/** Default transient warning; `{user}` and `{reason}` are substituted. */
export const DEFAULT_WARN_MESSAGE =
  "{user}, your message was removed for containing {reason}.";

export { MAX_REGEX_LENGTH };

const INVITE_RE =
  /(?:discord\.(?:gg|com\/invite)|discordapp\.com\/invite)\/([\w-]+)/i;

const URL_RE = /https?:\/\/([^\s/<>"']+)/gi;

/**
 * Screen user-supplied regex rules: length-capped and syntax-checked, with
 * invalid patterns reported via `onError` and dropped rather than throwing.
 * The surviving *sources* are returned - compiling them is the worker's job.
 */
export function screenRegexRules(
  patterns: string[],
  onError?: (pattern: string, reason: string) => void,
): string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    if (pattern.length > MAX_REGEX_LENGTH) {
      onError?.(pattern, `longer than ${MAX_REGEX_LENGTH} chars`);
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

export function compileRules(
  config: RuleConfig,
  onRegexError?: (pattern: string, reason: string) => void,
): CompiledRules {
  return {
    matcher:
      config.terms.length > 0
        ? (new AhoCorasick(
            config.terms.map((t) => t.toLowerCase()),
          ) as AhoMatcher)
        : null,
    regexSources: screenRegexRules(config.regexRules, onRegexError),
    config,
  };
}

/** First invite code in `content` that isn't allowlisted, else null. */
export function findBlockedInvite(
  content: string,
  allowlist: string[],
): string | null {
  const match = INVITE_RE.exec(content);
  if (!match?.[1]) return null;
  const code = match[1];
  return allowlist.some((a) => a.toLowerCase() === code.toLowerCase())
    ? null
    : code;
}

/** First linked domain that isn't (a subdomain of) an allowlisted one. */
export function findBlockedLink(
  content: string,
  allowlist: string[],
): string | null {
  for (const match of content.matchAll(URL_RE)) {
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

/** Percentage (0-100) of cased letters that are uppercase. */
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

/** Aho-Corasick term match - linear in the input, safe on the event loop. */
export function evaluateTerms(
  rules: CompiledRules,
  content: string,
): FilterHit | null {
  if (!rules.matcher) return null;
  const results = rules.matcher.search(content.toLowerCase());
  const term = results[0]?.[1]?.[0];
  return term ? { rule: "term", detail: term } : null;
}

/**
 * The bounded rules: invites, links, mentions and caps. All linear in the
 * message length, so they stay inline. Regex rules are *not* here - they run in
 * the regex worker (`FilterService.test`), between terms and these.
 */
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

/**
 * Every rule that can run synchronously, in priority order. `mentionCount` is
 * the message's user+role mention total (computed by the listener - this module
 * stays discord.js-free). The first hit wins.
 */
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

/** Human copy for the transient warning, per rule. */
export const HIT_REASONS: Record<FilterHit["rule"], string> = {
  term: "a filtered term",
  regex: "a filtered pattern",
  invite: "a server invite link",
  link: "a link that is not allowed here",
  mentions: "too many mentions",
  caps: "excessive caps",
  phish: "a known phishing/scam link",
};

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
