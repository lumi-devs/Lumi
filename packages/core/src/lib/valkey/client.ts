import {
  ValkeyKeys,
  ValkeyTTL,
  valkeyConnectionOptions,
  parseValkeyConnectionOption,
  createValkeyClient as createInfraValkeyClient,
  instrumentValkeyLatency as infraInstrumentValkeyLatency,
  type ResyncContext,
} from "@lumi/infrastructure/cache";
import type { ValkeyClient } from "@lumi/infrastructure/database";
import type { RedisOptions } from "iovalkey";
import type { ILogger } from "@lumi/shared";
import { valkeyCommandDuration } from "@lumi/observability";

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
