import { container } from "@sapphire/framework";
import {
  ValkeyKeys,
  ValkeyTTL,
  valkeyConnectionOptions,
  parseValkeyConnectionOption,
  createValkeyClient as createInfraValkeyClient,
  instrumentValkeyLatency as infraInstrumentValkeyLatency,
  InvalidationBus as InfraInvalidationBus,
  SignalBus as InfraSignalBus,
  type ResyncContext,
} from "@lumi/infrastructure/cache";
import type { ValkeyClient } from "@lumi/infrastructure/database";
import type { RedisOptions } from "iovalkey";

export type ValkeyOptions = RedisOptions;
import { valkeyCommandDuration } from "@lumi/observability";

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

export function createValkeyClient(): ValkeyClient {
  const logger = typeof container !== "undefined" && container.logger ? container.logger : undefined;
  return createInfraValkeyClient({
    logger,
    onDuration: (command, durationSeconds) => {
      valkeyCommandDuration.observe({ command }, durationSeconds);
    },
  });
}

export class InvalidationBus extends InfraInvalidationBus {
  public constructor(subscriber: ValkeyClient, publisher?: ValkeyClient) {
    const logger = typeof container !== "undefined" && container.logger ? container.logger : undefined;
    const pub = publisher ?? (typeof container !== "undefined" && container.valkey ? container.valkey : undefined);
    super(subscriber, pub, logger);
  }

  public override async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    if (typeof container !== "undefined" && container.valkey) {
      this.setPublisher(container.valkey);
    }
    return super.invalidate(...keys);
  }
}

export class SignalBus extends InfraSignalBus {
  public constructor(subscriber: ValkeyClient, publisher?: ValkeyClient) {
    const logger = typeof container !== "undefined" && container.logger ? container.logger : undefined;
    const pub = publisher ?? (typeof container !== "undefined" && container.valkey ? container.valkey : undefined);
    super(subscriber, pub, logger);
  }

  public override async publish(
    topic: string,
    payload: Record<string, string | number>,
  ): Promise<void> {
    if (typeof container !== "undefined" && container.valkey) {
      this.setPublisher(container.valkey);
    }
    return super.publish(topic, payload);
  }
}
