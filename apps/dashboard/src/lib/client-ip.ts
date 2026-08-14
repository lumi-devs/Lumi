import "server-only";

/**
 * Resolves the caller's IP for rate-limit keying.
 *
 * TRUST MODEL — read before changing. Every header here is attacker-controlled
 * unless a proxy the operator controls overwrites it. `X-Forwarded-For` is
 * *appended* to, so a client can pre-seed it with junk; using the raw header
 * (or its first entry) as a limiter key hands out a fresh bucket per request
 * and defeats the limiter entirely. What a single trusted proxy cannot forge
 * away is the hop *it* appended — the last entry — and the client-IP header it
 * sets itself.
 *
 * Deployment assumption: exactly one trusted reverse proxy in front of the
 * dashboard (docker-compose publishes `dashboard` on :8080 for a proxy to
 * terminate TLS in front of; NextAuth already runs with `trustHost: true` for
 * the same reason). Two chained proxies would need `TRUSTED_PROXY_HOPS` > 1.
 *
 * `CLIENT_IP_HEADER` lets an operator name the header their proxy sets and
 * strips from inbound requests (Cloudflare: `cf-connecting-ip`; nginx with
 * `proxy_set_header X-Real-IP $remote_addr`: `x-real-ip`). When set, it is
 * used verbatim and nothing else is consulted — that is the only fully
 * spoof-proof option, so prefer it.
 */

const DEFAULT_TRUSTED_HOPS = 1;

function trustedHops(): number {
  const raw = Number.parseInt(process.env["TRUSTED_PROXY_HOPS"] ?? "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_TRUSTED_HOPS;
}

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // Strip an IPv6 bracket/port wrapper ("[::1]:443") and an IPv4 port suffix,
  // so the same client can't split its budget across ephemeral source ports.
  const unbracketed = /^\[(.+)\](?::\d+)?$/.exec(trimmed)?.[1] ?? trimmed;
  const withoutPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(unbracketed)?.[1] ?? unbracketed;
  return isIpish(withoutPort) ? withoutPort.toLowerCase() : null;
}

/**
 * Deliberately loose: this only has to reject free-form junk that would inflate
 * the key space, not validate addresses.
 */
function isIpish(value: string): boolean {
  if (value.length > 45) return false;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || /^[0-9a-fA-F:.]+$/.test(value);
}

export const UNKNOWN_CLIENT_IP = "unknown";

/**
 * @param headers the incoming request headers (`await headers()` in a Server
 * Action / Server Component).
 * @returns a single IP, or `"unknown"` when none can be trusted — callers key
 * their rate limiter on it, so all untrusted traffic deliberately shares one
 * bucket rather than getting a free one each.
 */
export function getClientIp(headers: Headers): string {
  const configured = process.env["CLIENT_IP_HEADER"]?.trim().toLowerCase();
  if (configured) {
    return normalize(headers.get(configured)) ?? UNKNOWN_CLIENT_IP;
  }

  for (const header of ["cf-connecting-ip", "x-real-ip"]) {
    const value = normalize(headers.get(header));
    if (value) return value;
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",");
    // Count back from the right: entry -N is the address the Nth-from-last
    // proxy observed. Anything further left was supplied by the client.
    const index = hops.length - trustedHops();
    const candidate = normalize(hops[Math.max(index, 0)]);
    if (candidate) return candidate;
  }

  return UNKNOWN_CLIENT_IP;
}
