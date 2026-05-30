// Filter module's worker-thread handler. Registered by FilterModule.onLoad
// via `registerWorkerHandler`; the central worker script imports this file
// dynamically and dispatches FILTER_BUILD / FILTER_MATCH actions to it.
//
// Default export is a single dispatch function rather than per-action exports
// so we own only one slot in the worker registry; the {kind} field discriminates.

// @ts-expect-error - ahocorasick does not provide type declarations
import AhoCorasick from "ahocorasick";
import { z } from "zod";

// Validate the cross-thread payload at the boundary instead of trusting a blind
// `as Payload` cast: an unvalidated object off the worker channel could carry
// the wrong shape (non-array `terms`, missing `text`) and corrupt the automaton
// map or throw deep inside `.search`. The discriminated union rejects it cleanly.
const payloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("build"),
    key: z.string(),
    terms: z.array(z.string()),
  }),
  z.object({ kind: z.literal("match"), key: z.string(), text: z.string() }),
]);

const automatons = new Map<string, AhoCorasick | null>();

export default function dispatch(payload: unknown): unknown {
  const p = payloadSchema.parse(payload);
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
  // Unreachable: payloadSchema guarantees kind ∈ {build, match}.
  throw new Error("filter/aho-corasick: unhandled payload kind");
}
