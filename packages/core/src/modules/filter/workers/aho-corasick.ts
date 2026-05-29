// Filter module's worker-thread handler. Registered by FilterModule.onLoad
// via `registerWorkerHandler`; the central worker script imports this file
// dynamically and dispatches FILTER_BUILD / FILTER_MATCH actions to it.
//
// Default export is a single dispatch function rather than per-action exports
// so we own only one slot in the worker registry; the {kind} field discriminates.

// @ts-expect-error - ahocorasick does not provide type declarations
import AhoCorasick from "ahocorasick";

interface BuildPayload {
  kind: "build";
  key: string;
  terms: string[];
}
interface MatchPayload {
  kind: "match";
  key: string;
  text: string;
}
type Payload = BuildPayload | MatchPayload;

const automatons = new Map<string, AhoCorasick | null>();

export default function dispatch(payload: unknown): unknown {
  const p = payload as Payload;
  if (p.kind === "build") {
    automatons.set(p.key, p.terms.length > 0 ? new AhoCorasick(p.terms) : null);
    return { termCount: p.terms.length };
  }
  if (p.kind === "match") {
    if (!automatons.has(p.key)) return { miss: true };
    const ac = automatons.get(p.key);
    if (!ac) return { miss: false, term: null };
    const results = ac.search(p.text.toLowerCase());
    return { miss: false, term: results[0]?.[1]?.[0] ?? null };
  }
  throw new Error(
    `filter/aho-corasick: unknown kind ${(p as { kind: string }).kind}`,
  );
}
