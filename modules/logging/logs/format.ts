function longestBacktickRun(value: string): number {
  let longest = 0;
  let current = 0;
  for (const char of value) {
    if (char === "`") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function inlineCode(value: string): string {
  const fence = "`".repeat(Math.max(1, longestBacktickRun(value) + 1));
  return `${fence}${value}${fence}`;
}

export function fencedCode(value: string, maxLength: number): string {
  const text = value.slice(0, maxLength);
  if (!text) return "*No content*";
  const fence = "`".repeat(Math.max(3, longestBacktickRun(text) + 1));
  return `${fence}\n${text}\n${fence}`;
}
