import { getRegexProbeWorker } from "#src/lib/regex-worker/Handler.js";

export const MaxRegexLength = 256;

const AdversarialInputs: readonly string[] = [
  `${"a".repeat(60)}!`,
  `${"ab".repeat(30)}!`,
  `${"1".repeat(60)}!`,
  `${"a1 ".repeat(30)}!`,
  `${"x,".repeat(40)}!`,
  `${"https://a.example/".repeat(20)}!`,
  "éèê".repeat(40),
];

export async function validateRegexPattern(
  pattern: string,
): Promise<string | null> {
  if (pattern.length === 0) return "pattern is empty";
  if (pattern.length > MaxRegexLength) {
    return `pattern is longer than ${MaxRegexLength} characters`;
  }

  try {
    new RegExp(pattern, "iu");
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }

  const completed = await getRegexProbeWorker().probe(pattern, [
    ...AdversarialInputs,
  ]);
  return completed
    ? null
    : "pattern backtracks catastrophically on hostile input";
}
