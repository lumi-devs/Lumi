// / <reference lib="webworker" />
declare const self: Worker;

// @ts-expect-error - ahocorasick does not provide type declarations
import AhoCorasick from "ahocorasick";
import type { WorkerRequest, WorkerResponse } from "../types.js";
import { WorkerAction } from "../types.js";

interface BuildPayload {
  key: string;
  terms: string[];
}
interface MatchPayload {
  key: string;
  text: string;
}

// Per-worker cache of compiled automatons, keyed by a hash of the term list.
const automatons = new Map<string, AhoCorasick | null>();

function build({ key, terms }: BuildPayload): { termCount: number } {
  automatons.set(key, terms.length > 0 ? new AhoCorasick(terms) : null);
  return { termCount: terms.length };
}

function match({
  key,
  text,
}: MatchPayload): { miss: true } | { miss: false; term: string | null } {
  if (!automatons.has(key)) return { miss: true };
  const ac = automatons.get(key);
  if (!ac) return { miss: false, term: null };
  const results = ac.search(text.toLowerCase());
  return { miss: false, term: results[0]?.[1]?.[0] ?? null };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, action, payload } = event.data;

  try {
    let data: unknown;

    switch (action) {
      case WorkerAction.PING:
        data = "pong";
        break;
      case WorkerAction.FILTER_BUILD:
        data = build(payload as BuildPayload);
        break;
      case WorkerAction.FILTER_MATCH:
        data = match(payload as MatchPayload);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    self.postMessage({ id, success: true, data } satisfies WorkerResponse);
  } catch (err: unknown) {
    const error = err as Error;
    self.postMessage({
      id,
      success: false,
      error: error.message ?? "Unknown worker error",
    } satisfies WorkerResponse);
  }
};
