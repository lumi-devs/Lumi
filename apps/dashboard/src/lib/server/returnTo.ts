const Fallback = "/guilds";
const Base = "https://dashboard.invalid";

function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string") return Fallback;
  const candidate = value.slice(0, 500);
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    hasControlChar(candidate)
  ) {
    return Fallback;
  }

  try {
    const url = new URL(candidate, Base);
    if (url.origin !== Base) return Fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("/") && !path.startsWith("//") ? path : Fallback;
  } catch {
    return Fallback;
  }
}
