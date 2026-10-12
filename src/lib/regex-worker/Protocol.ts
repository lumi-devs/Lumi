interface LoadRequest {
  kind: "load";
  key: string;
  patterns: string[];
}

interface TestRequest {
  kind: "test";
  id: number;
  key: string;
  content: string;
}

interface ProbeRequest {
  kind: "probe";
  id: number;
  pattern: string;
  inputs: string[];
}

interface MatchAllRequest {
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

interface ReadyResponse {
  kind: "ready";
}

interface ProgressResponse {
  kind: "progress";
  id: number;
  index: number;
}

interface ResultResponse {
  kind: "result";
  id: number;
  index: number | null;
}

interface UnknownResponse {
  kind: "unknown";
  id: number;
  key: string;
}

interface MatchesResponse {
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
