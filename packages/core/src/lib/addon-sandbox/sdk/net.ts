import { call } from "./rpc.js";

export interface FetchResult {
  status: number;
  contentType: string;
  encoding: "text" | "base64";
  body: string;
}

export interface FetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export function fetchUrl(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  return call("net.fetch", { url, ...opts });
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await fetchUrl(url, opts);
  if (res.encoding !== "text") throw new Error(`Expected text, got ${res.contentType || "binary"}`);
  return res.body;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  return JSON.parse(await fetchText(url, opts)) as T;
}
