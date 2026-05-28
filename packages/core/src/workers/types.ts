export enum WorkerAction {
  PING = "PING",
  FILTER_BUILD = "FILTER_BUILD",
  FILTER_MATCH = "FILTER_MATCH",
}

export interface WorkerRequest {
  id: string;
  action: string;
  payload: unknown;
}

export interface WorkerResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
