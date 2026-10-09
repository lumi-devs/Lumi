import {
  InvalidationBus as InfraInvalidationBus,
  SignalBus as InfraSignalBus,
} from "@lumi/infrastructure/cache";
import type { ValkeyClient } from "@lumi/infrastructure/database";
import type { ILogger } from "@lumi/shared";

// Max keys per del+publish round: keeps one broadcast in the tens-of-KB
// range even when a guild eviction hands over thousands of keys.
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
    // Bound the pub/sub payload: a guild eviction can collect thousands of
    // keys, and one giant message would fan out to every shard subscriber at
    // once. Small invalidations still go out as the single del+publish they
    // are today.
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
