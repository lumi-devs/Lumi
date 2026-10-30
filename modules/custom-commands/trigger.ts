import { Limits, type TriggerType } from "./types.js";

export type TriggerValidation =
  | { ok: true }
  | { ok: false; error: string };

export interface ReactionEmojiLike {
  id?: string | null;
  name?: string | null;
  toString?: () => string;
}

export function normalizeCommandName(input: string): string {
  return input.trim().toLowerCase();
}

export function validateCommandName(
  name: string,
): TriggerValidation {
  if (name.length === 0) return { ok: false, error: "Name is required." };
  if (name.length > Limits.nameMaxLength) {
    return {
      ok: false,
      error: `Name must be at most ${Limits.nameMaxLength} characters.`,
    };
  }
  if (!/^[a-z0-9][a-z0-9 _.-]*$/.test(name)) {
    return {
      ok: false,
      error:
        "Name must start with a letter or digit and contain only letters, digits, spaces, _, . or -.",
    };
  }
  return { ok: true };
}

export function compileSafeRegex(
  pattern: string,
): { ok: true; regex: RegExp } | { ok: false; error: string } {
  if (pattern.length === 0) {
    return { ok: false, error: "Regex pattern is required." };
  }
  if (pattern.length > Limits.regexMaxLength) {
    return {
      ok: false,
      error: `Regex patterns are limited to ${Limits.regexMaxLength} characters.`,
    };
  }
  if (/\\[1-9]/.test(pattern) || /\\k<[^>]+>/.test(pattern)) {
    return { ok: false, error: "Backreferences are not allowed in regex triggers." };
  }
  if (/\(\?<[=!]/.test(pattern)) {
    return { ok: false, error: "Lookbehind is not allowed in regex triggers." };
  }
  if (/(\([^)]*[+*][^)]*\))[+*{]/.test(pattern)) {
    return {
      ok: false,
      error: "Nested repetition is not allowed in regex triggers.",
    };
  }
  try {
    return { ok: true, regex: new RegExp(pattern, "iu") };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid regex pattern.",
    };
  }
}

export function safeRegexTest(pattern: string, input: string): boolean {
  const compiled = compileSafeRegex(pattern);
  if (!compiled.ok) return false;
  try {
    return compiled.regex.test(input);
  } catch {
    return false;
  }
}

export function validateTrigger(
  type: TriggerType,
  trigger: string,
): TriggerValidation {
  if (type === "interval" || type === "cron") {
    return { ok: true };
  }

  if (trigger.length === 0) {
    return { ok: false, error: "A trigger value is required for this type." };
  }
  if (trigger.length > Limits.triggerMaxLength) {
    return {
      ok: false,
      error: `Trigger must be at most ${Limits.triggerMaxLength} characters.`,
    };
  }

  if (type === "regex") {
    const compiled = compileSafeRegex(trigger);
    return compiled.ok ? { ok: true } : compiled;
  }

  if (type === "button" || type === "select" || type === "modal") {
    if (trigger.length > 100) {
      return { ok: false, error: "Component custom IDs are limited to 100 characters." };
    }
    if (trigger.includes("*") && !trigger.endsWith("*")) {
      return { ok: false, error: "A component trigger may only use * as a trailing wildcard." };
    }
    if (trigger.replace(/\*$/, "").length === 0) {
      return { ok: false, error: "Component trigger cannot be only a wildcard." };
    }
  }

  return { ok: true };
}

export function splitArgs(input: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match = pattern.exec(input);
  while (match !== null) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value !== undefined) args.push(value);
    match = pattern.exec(input);
  }
  return args;
}

export function matchMessageTrigger(
  type: TriggerType,
  trigger: string,
  content: string,
  prefix: string,
): string[] | null {
  const text = content.trim();
  if (text.length === 0) return null;

  if (type === "command") {
    if (!prefix || !text.startsWith(prefix)) return null;
    const withoutPrefix = text.slice(prefix.length).trimStart();
    const [name, ...rest] = withoutPrefix.split(/ +/g);
    if (!name || name.toLowerCase() !== trigger.toLowerCase()) return null;
    return splitArgs(rest.join(" "));
  }

  if (type === "prefix") {
    if (!text.toLowerCase().startsWith(trigger.toLowerCase())) return null;
    return splitArgs(text.slice(trigger.length).trim());
  }

  if (type === "exact") {
    if (text.toLowerCase() !== trigger.toLowerCase()) return null;
    return splitArgs(text);
  }

  if (type === "startsWith") {
    if (!text.toLowerCase().startsWith(trigger.toLowerCase())) return null;
    return splitArgs(text.slice(trigger.length).trim());
  }

  if (type === "contains") {
    if (!text.toLowerCase().includes(trigger.toLowerCase())) return null;
    return splitArgs(text);
  }

  if (type === "regex") {
    if (!safeRegexTest(trigger, text)) return null;
    return splitArgs(text);
  }

  return null;
}

export function normalizeEmoji(emoji: ReactionEmojiLike): string {
  if (emoji.id) return emoji.id;
  return emoji.name ?? "";
}

export function emojiMatches(trigger: string, emoji: ReactionEmojiLike): boolean {
  const normalized = trigger.trim();
  if (normalized.length === 0) return false;

  const id = emoji.id ?? null;
  const name = emoji.name ?? "";
  const rendered = `<${name}:${id ?? ""}>`;

  if (id && (normalized === id || normalized === `${name}:${id}`)) return true;
  if (normalized === rendered) return true;
  if (!id && normalized === name) return true;

  const custom = /^<a?:([^:>]+):(\d+)>$/.exec(normalized);
  if (custom && id && custom[2] === id) return true;
  return false;
}

export function matchesCustomId(trigger: string, customId: string): boolean {
  if (trigger === "*") return false;
  if (trigger.endsWith("*")) {
    return customId.startsWith(trigger.slice(0, -1));
  }
  return customId === trigger;
}

export function isMessageTrigger(type: TriggerType): boolean {
  return (
    type === "command" ||
    type === "prefix" ||
    type === "exact" ||
    type === "startsWith" ||
    type === "contains" ||
    type === "regex"
  );
}
