import {ValkeyKeys, ValkeyTTL, valkeyConnectionOptions, parseValkeyConnectionOption, createValkeyClient as createInfraValkeyClient, instrumentValkeyLatency as infraInstrumentValkeyLatency, type ResyncContext} from "#src/lib/valkey/Store.js";
import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import type { RedisOptions } from "iovalkey";
import type { ILogger } from "#src/shared/Index.ts";
import { valkeyCommandDuration } from "#src/observability/Index.ts";

type ValkeyOptions = RedisOptions;

export {
  ValkeyKeys,
  ValkeyTTL,
  valkeyConnectionOptions,
  parseValkeyConnectionOption,
  type ResyncContext,
  type ValkeyOptions,
  type ValkeyClient,
};

export function instrumentValkeyLatency(client: ValkeyClient): ValkeyClient {
  return infraInstrumentValkeyLatency(client, (command, durationSeconds) => {
    valkeyCommandDuration.observe({ command }, durationSeconds);
  });
}

export function createValkeyClient(logger?: ILogger): ValkeyClient {
  return createInfraValkeyClient({
    logger,
    onDuration: (command, durationSeconds) => {
      valkeyCommandDuration.observe({ command }, durationSeconds);
    },
  });
}
