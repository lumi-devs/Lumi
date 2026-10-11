import {InvalidationBus as InfraInvalidationBus, SignalBus as InfraSignalBus} from "#src/lib/valkey/Store.js";
import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import type { ILogger } from "#src/shared/Index.ts";

const MAX_KEYS_PER_INVALIDATION = 500;

export class InvalidationBus extends InfraInvalidationBus {
  public constructor(
    subscriber: ValkeyClient,
    publisher?: ValkeyClient,
    logger?: ILogger,
  ) {
    super(subscriber, publisher, logger);
  }

  public override async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    for (let i = 0; i < keys.length; i += MAX_KEYS_PER_INVALIDATION) {
      await super.invalidate(...keys.slice(i, i + MAX_KEYS_PER_INVALIDATION));
    }
  }
}

export class SignalBus extends InfraSignalBus {
  public constructor(
    subscriber: ValkeyClient,
    publisher?: ValkeyClient,
    logger?: ILogger,
  ) {
    super(subscriber, publisher, logger);
  }
}
