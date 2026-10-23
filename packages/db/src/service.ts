import type { Logger } from "@lumi/foundation";
import type { InvalidationPort, RedisClient, RedisKeys } from "@lumi/redis";
import type { DatabaseHandle } from "./client.ts";
import type { DatabaseCaches, RepositoryDeps } from "./repositories/base.ts";
import { AfkRepository } from "./repositories/afk.ts";
import { ConfigRepository } from "./repositories/config.ts";
import { DownloaderRepository } from "./repositories/downloader.ts";
import { GuildRepository } from "./repositories/guild.ts";
import { ModuleDataRepository } from "./repositories/module-data.ts";
import { ModuleStateRepository } from "./repositories/module-state.ts";
import { PermitRepository } from "./repositories/permits.ts";

export interface DatabaseServiceOptions {
  handle: DatabaseHandle;
  caches: DatabaseCaches;
  invalidation: InvalidationPort;
  redis: RedisClient;
  keys: RedisKeys;
  logger: Logger;
}

export class DatabaseService {
  public readonly guild: GuildRepository;
  public readonly config: ConfigRepository;
  public readonly modules: ModuleStateRepository;
  public readonly moduleData: ModuleDataRepository;
  public readonly afk: AfkRepository;
  public readonly downloader: DownloaderRepository;
  public readonly permits: PermitRepository;

  readonly #handle: DatabaseHandle;

  public constructor(options: DatabaseServiceOptions) {
    this.#handle = options.handle;
    const deps: RepositoryDeps = {
      prisma: options.handle.prisma,
      reader: options.handle.reader,
      caches: options.caches,
      invalidation: options.invalidation,
      redis: options.redis,
      keys: options.keys,
      logger: options.logger,
    };
    this.guild = new GuildRepository(deps);
    this.config = new ConfigRepository(deps);
    this.modules = new ModuleStateRepository(deps);
    this.moduleData = new ModuleDataRepository(deps);
    this.afk = new AfkRepository(deps);
    this.downloader = new DownloaderRepository(deps);
    this.permits = new PermitRepository(deps);
  }

  public ping(role: "primary" | "replica" = "primary"): Promise<number> {
    return this.#handle.ping(role);
  }

  public close(): Promise<void> {
    return this.#handle.close();
  }
}
