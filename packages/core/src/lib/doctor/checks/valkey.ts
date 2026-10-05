import Valkey, { Cluster } from "iovalkey";
import { valkeyConnectionOptions } from "#lib/database/valkey.js";
import type { ValkeyClient as ValkeyConnection } from "#lib/database/cluster-safe.js";
import { getValkeyClusterNodes, getValkeyClusterScaleReads } from "#lib/env.js";
import { runCheck } from "#lib/doctor/util.js";
import type { DoctorCheckResult } from "#lib/doctor/types.js";

export const ValkeyCheckName = "valkey";

export interface ValkeyProbeClient {
  ping: () => Promise<string>;
  info: (section?: string) => Promise<string>;
  quit: () => Promise<unknown>;
}

export interface ValkeyCheckDeps {
  /**
   * Override for tests. Real implementation opens a short-lived connection
   * using the same `valkeyConnectionOptions()`/cluster-detection helpers the
   * long-lived client uses, closed again after the probe.
   */
  getClient?: () => ValkeyProbeClient;
}

function defaultGetClient(): ValkeyProbeClient {
  const nodes = getValkeyClusterNodes();
  const client: ValkeyConnection = nodes
    ? new Cluster(nodes, {
        lazyConnect: true,
        scaleReads: getValkeyClusterScaleReads(),
        redisOptions: { ...valkeyConnectionOptions(), maxRetriesPerRequest: 1 },
      })
    : new Valkey({
        ...valkeyConnectionOptions(),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
  client.on("error", () => undefined);
  return {
    ping: () => client.ping(),
    info: (section) => (section ? client.info(section) : client.info()),
    quit: () => client.quit(),
  };
}

function parseInfoField(raw: string, field: string): string | null {
  const match = raw.match(new RegExp(`^${field}:(.+)$`, "m"));
  return match ? match[1]!.trim() : null;
}

export async function checkValkey(
  deps: ValkeyCheckDeps = {},
  timeoutMs = 5_000,
): Promise<DoctorCheckResult> {
  return runCheck(ValkeyCheckName, timeoutMs, async () => {
    const client = (deps.getClient ?? defaultGetClient)();
    try {
      await client.ping();
    } catch (err) {
      return {
        name: ValkeyCheckName,
        status: "fail",
        detail: `PING failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check VALKEY_URL/VALKEY_HOST/VALKEY_PORT (or VALKEY_SENTINELS) and that Valkey is reachable.",
      };
    }

    let version = "unknown";
    try {
      const info = await client.info("server");
      const valkeyVersion = parseInfoField(info, "valkey_version");
      if (valkeyVersion) {
        version = `Valkey ${valkeyVersion}`;
      }
    } catch {
      // PING already succeeded - INFO failing (e.g. a restricted ACL) is
      // worth surfacing but shouldn't turn a reachable server into a failure.
      return {
        name: ValkeyCheckName,
        status: "warn",
        detail: "PING succeeded, but INFO failed - version could not be determined.",
      };
    } finally {
      await client.quit().catch(() => undefined);
    }

    return {
      name: ValkeyCheckName,
      status: "ok",
      detail: `Connected to ${version}.`,
    };
  });
}
