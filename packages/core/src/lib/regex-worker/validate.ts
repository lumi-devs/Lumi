import { getRegexWorker } from "./RegexWorkerHandler.js";

/** Patterns longer than this are rejected outright - length feeds blowup. */
export const MAX_REGEX_LENGTH = 256;

/**
 * Inputs chosen to blow up the classic backtracking shapes - `(a+)+$`,
 * `(\w|\d)*!`, `(.*,)*` - within the probe budget. Each ends in a character the
 * pattern most likely cannot match, which is what forces exhaustive backtracking.
 */
export const AdversarialInputs: readonly string[] = [
  `${"a".repeat(60)}!`,
  `${"ab".repeat(30)}!`,
  `${"1".repeat(60)}!`,
  `${"a1 ".repeat(30)}!`,
  `${"x,".repeat(40)}!`,
  `${"https://a.example/".repeat(20)}!`,
  "éèê".repeat(40),
];

/**
 * Vet a guild-supplied pattern before it is stored. Syntax is checked inline
 * (compiling a regex does not backtrack); the timing check runs in the regex
 * worker under a hard budget, so validation cannot stall the caller either.
 *
 * @returns a human-readable rejection reason, or null when the pattern is safe.
 */
export async function validateRegexPattern(
  pattern: string,
): Promise<string | null> {
  if (pattern.length === 0) return "pattern is empty";
  if (pattern.length > MAX_REGEX_LENGTH) {
    return `pattern is longer than ${MAX_REGEX_LENGTH} characters`;
  }

  try {
    new RegExp(pattern, "iu");
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }

  const completed = await getRegexWorker().probe(pattern, [
    ...AdversarialInputs,
  ]);
  return completed
    ? null
    : "pattern backtracks catastrophically on hostile input";
}
