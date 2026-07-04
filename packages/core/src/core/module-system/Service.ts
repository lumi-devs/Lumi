import { container, Piece } from "@sapphire/framework";

/**
 * Registry of service piece names → classes. Each service file augments this
 * next to its class so `getService("name")` returns the right type:
 *
 * ```ts
 * declare module "#core/module-system/Service.js" {
 *   interface Services {
 *     afk: AfkService;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging target
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

export class Service extends Piece {
  public constructor(
    context: Piece.LoaderContext,
    options: Piece.Options = {},
  ) {
    super(context, options);
  }

  public get logger() {
    return this.container.logger;
  }

  public get db() {
    return this.container.db;
  }

  public get redis() {
    return this.container.redis;
  }
}
