import { getRpcHealthUrl } from "@lumi/lib/env.js";
import { runCheck } from "@lumi/lib/doctor/run-check.js";
import type { DoctorCheckResult } from "@lumi/lib/doctor/types.js";

export const RpcCheckName = "rpc";

export interface RpcCheckDeps {
  /** Override for tests; defaults to `getRpcHealthUrl()`. */
  getUrl?: () => string | null;
  /** Override for tests; defaults to a real `fetch(url + "/healthz")`. */
  fetchHealth?: (url: string) => Promise<Response>;
}

async function defaultFetchHealth(url: string): Promise<Response> {
  return fetch(`${url}/healthz`);
}

/**
 * `apps/api`'s `/healthz` (`packages/core/src/lib/rpc/http-server.ts`) is
 * unauthenticated by design and returns a bare `"ok"` body with no headers
 * identifying `@lumi/contracts` version - the version handshake
 * (`x-lumi-contract-version`) only happens on the authenticated `/rpc` path,
 * per-request. So this check can only confirm reachability; it does not
 * (and cannot, without sending an authenticated RPC call) compare contract
 * versions.
 */
export async function checkRpc(
  deps: RpcCheckDeps = {},
  timeoutMs = 5_000,
): Promise<DoctorCheckResult> {
  return runCheck(RpcCheckName, timeoutMs, async () => {
    const url = (deps.getUrl ?? getRpcHealthUrl)();
    if (!url) {
      return {
        name: RpcCheckName,
        status: "skip",
        detail: "RPC_HTTP_URL is not configured.",
      };
    }

    let response: Response;
    try {
      response = await (deps.fetchHealth ?? defaultFetchHealth)(url);
    } catch (err) {
      return {
        name: RpcCheckName,
        status: "fail",
        detail: `GET ${url}/healthz failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check apps/api is running and reachable at RPC_HTTP_URL.",
      };
    }

    if (!response.ok) {
      return {
        name: RpcCheckName,
        status: "fail",
        detail: `GET ${url}/healthz returned HTTP ${response.status}.`,
      };
    }
    return {
      name: RpcCheckName,
      status: "ok",
      detail: `${url}/healthz is reachable (contract version is not exposed on this endpoint; reachability only).`,
    };
  });
}
