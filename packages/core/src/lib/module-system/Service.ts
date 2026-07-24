import { container, Piece } from "@sapphire/framework";

/**
 * Registry of service piece names → classes. Each service file augments this
 * next to its class so `getService("name")` returns the right type:
 *
 * ```ts
 * declare module "#lib/module-system/Service.js" {
 *   interface Services {
 *     afk: AfkService;
 *   }
 * }
 * ```
 */

export interface Services {}

/** Typed lookup for service pieces — use instead of `stores.get("services").get(...) as X`. */
export function getService<K extends keyof Services>(name: K): Services[K] {
  const service = tryGetService(name);
  if (!service) throw new Error(`Service "${name}" is not loaded`);
  return service;
}

/** Like {@link getService} but returns undefined when the piece isn't loaded (e.g. module disabled). */
export function tryGetService<K extends keyof Services>(
  name: K,
): Services[K] | undefined {
  return container.stores.get("services").get(name) as Services[K] | undefined;
}

/**
 * The base class that all feature services must extend.
 * Services encapsulate domain logic and database operations, providing a centralized
 * interface for commands and background tasks to interact with data.
 */
export class Service extends Piece {
  /**
   * Constructs a new Service instance.
   *
   * @param context - The loader context provided by Sapphire.
   * @param options - Additional options to configure the service.
   */
  public constructor(
    context: Piece.LoaderContext,
    options: Piece.Options = {},
  ) {
    super(context, options);
  }

  /**
   * Quick accessor for the global Pino logger instance.
   *
   * @returns The logger instance from the Sapphire container.
   */
  public get logger() {
    return this.container.logger;
  }

  /**
   * Quick accessor for the global Prisma database service.
   *
   * @returns The database service instance from the Sapphire container.
   */
  public get db() {
    return this.container.db;
  }

  /**
   * Quick accessor for the global Redis client.
   *
   * @returns The Redis client instance from the Sapphire container.
   */
  public get redis() {
    return this.container.redis;
  }
}
