export const RegexMaxLength = 200;

export type SafeRegexResult =
  { ok: true; regex: RegExp } | { ok: false; error: string };

interface GroupFrame {
  hasAlternation: boolean;
  hasQuantifier: boolean;
}

function isQuantifierStart(pattern: string, index: number): boolean {
  const char = pattern[index];
  if (char === "*" || char === "+" || char === "?") return true;
  if (char !== "{") return false;
  return /^\{\d+(?:,\d*)?\}/.test(pattern.slice(index));
}

function skipGroupPrefix(pattern: string, index: number): number {
  if (pattern[index + 1] !== "?") return index;
  if (pattern[index + 2] !== "<") return index + 2;
  if (pattern[index + 3] === "=" || pattern[index + 3] === "!") {
    return index + 3;
  }
  const close = pattern.indexOf(">", index + 3);
  return close === -1 ? index + 2 : close;
}

function findUnsafeRepetition(pattern: string): string | null {
  const stack: GroupFrame[] = [{ hasAlternation: false, hasQuantifier: false }];
  let inClass = false;
  let escaped = false;

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }

    if (char === "(") {
      stack.push({ hasAlternation: false, hasQuantifier: false });
      index = skipGroupPrefix(pattern, index);
      continue;
    }

    if (char === ")") {
      if (stack.length > 1) {
        const frame = stack.pop() as GroupFrame;
        const parent = stack[stack.length - 1];
        if (frame.hasAlternation || frame.hasQuantifier) {
          parent.hasQuantifier = true;
        }
        if (isQuantifierStart(pattern, index + 1)) {
          if (frame.hasAlternation || frame.hasQuantifier) {
            return "Nested repetition or repeated alternation is not allowed.";
          }
          parent.hasQuantifier = true;
        }
      }
      continue;
    }

    if (char === "|") {
      stack[stack.length - 1].hasAlternation = true;
      continue;
    }

    if (isQuantifierStart(pattern, index)) {
      stack[stack.length - 1].hasQuantifier = true;
    }
  }

  return null;
}

export function compileSafeRegex(
  pattern: string,
  flags = "i",
): SafeRegexResult {
  if (pattern.length === 0) {
    return { ok: false, error: "Regex pattern is required." };
  }
  if (pattern.length > RegexMaxLength) {
    return {
      ok: false,
      error: `Regex patterns are limited to ${RegexMaxLength} characters.`,
    };
  }
  if (/\\[1-9]/.test(pattern) || /\\k<[^>]+>/.test(pattern)) {
    return {
      ok: false,
      error: "Backreferences are not allowed in regular expressions.",
    };
  }
  if (/\(\?<[=!]/.test(pattern)) {
    return {
      ok: false,
      error: "Lookbehind is not allowed in regular expressions.",
    };
  }

  const unsafe = findUnsafeRepetition(pattern);
  if (unsafe) return { ok: false, error: unsafe };

  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid regex pattern.",
    };
  }
}

export interface InvalidRegexPattern {
  pattern: string;
  error: string;
}

export function invalidRegexPatterns(
  patterns: readonly string[],
  flags = "i",
): InvalidRegexPattern[] {
  const invalid: InvalidRegexPattern[] = [];
  for (const pattern of patterns) {
    const compiled = compileSafeRegex(pattern, flags);
    if (!compiled.ok) invalid.push({ pattern, error: compiled.error });
  }
  return invalid;
}

export function safeRegexTest(
  pattern: string,
  input: string,
  flags = "i",
): boolean {
  const compiled = compileSafeRegex(pattern, flags);
  if (!compiled.ok) return false;
  try {
    return compiled.regex.test(input);
  } catch {
    return false;
  }
}
