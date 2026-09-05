import { redirect } from "next/navigation";

export type LegacySearchParams = Record<string, string | string[] | undefined>;

/**
 * Sends a pre-reorganisation URL to its current home, carrying the query string
 * across so a bookmarked filter still lands on the same filtered view.
 */
export function legacyRedirect(target: string, query: LegacySearchParams): never {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  redirect(qs ? `${target}?${qs}` : target);
}
