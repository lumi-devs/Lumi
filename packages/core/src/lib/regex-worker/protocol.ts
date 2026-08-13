/**
 * Wire format between {@link RegexWorkerHandler} and the worker thread. Kept in
 * its own module so the worker entrypoint imports nothing from the bot.
 */

/** Install a pattern set under `key`; subsequent tests reference it by key. */
export interface LoadRequest {
  kind: "load";
  key: string;
  patterns: string[];
}

/** Evaluate `content` against the pattern set stored under `key`. */
export interface TestRequest {
  kind: "test";
  id: number;
  key: string;
  content: string;
}

/** Run one pattern against adversarial inputs; used to vet saved patterns. */
export interface ProbeRequest {
  kind: "probe";
  id: number;
  pattern: string;
  inputs: string[];
}

/**
 * Run one ad-hoc pattern against many contents in a single round trip, so a
 * bulk caller (e.g. `purge regex`) spends one budget per batch instead of
 * monopolising the worker with one request per item.
 */
export interface MatchAllRequest {
  kind: "matchAll";
  id: number;
  pattern: string;
  contents: string[];
}

export type WorkerRequest =
  | LoadRequest
  | TestRequest
  | ProbeRequest
  | MatchAllRequest;

/** Sent once at startup; spawn cost must not count against an eval budget. */
export interface ReadyResponse {
  kind: "ready";
}

/** Sent before each pattern runs so the parent knows which one hung on timeout. */
export interface ProgressResponse {
  kind: "progress";
  id: number;
  index: number;
}

/** `index` is the matching pattern's position, or null when nothing matched. */
export interface ResultResponse {
  kind: "result";
  id: number;
  index: number | null;
}

/** The referenced pattern set is not loaded (worker restarted mid-flight). */
export interface UnknownResponse {
  kind: "unknown";
  id: number;
  key: string;
}

/** Positions in the request's `contents` that the pattern matched. */
export interface MatchesResponse {
  kind: "matches";
  id: number;
  indexes: number[];
}

export type WorkerResponse =
  | ReadyResponse
  | ProgressResponse
  | ResultResponse
  | UnknownResponse
  | MatchesResponse;
