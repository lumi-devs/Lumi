import type { NamespacedCache } from "@lumi/cache";
import type { Logger } from "@lumi/foundation";
import type { InvalidationPort, RedisClient, RedisKeys } from "@lumi/redis";
import type { DatabaseClient } from "../client.ts";

export interface DatabaseCaches {
  readonly guild: NamespacedCache;
  readonly config: NamespacedCache;
  readonly module: NamespacedCache;
  readonly moduleData: NamespacedCache;
  readonly afk: NamespacedCache;
}

export interface RepositoryDeps {
  readonly prisma: DatabaseClient;
  readonly reader: DatabaseClient;
  readonly caches: DatabaseCaches;
  readonly invalidation: InvalidationPort;
  readonly redis: RedisClient;
  readonly keys: RedisKeys;
  readonly logger: Logger;
}

export abstract class Repository {
  protected readonly deps: RepositoryDeps;

  protected constructor(deps: RepositoryDeps) {
    this.deps = deps;
  }

  protected get prisma(): DatabaseClient {
    return this.deps.prisma;
  }

  protected get reader(): DatabaseClient {
    return this.deps.reader;
  }

  protected invalidate(...keys: string[]): Promise<void> {
    return this.deps.invalidation.invalidate(...keys);
  }
}
