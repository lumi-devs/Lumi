import { container } from "@sapphire/framework";
import { Utility as SapphireUtility, type UtilitiesStore } from "@sapphire/plugin-utilities-store";
import { utilitiesTotal, utilityDuration } from "@lumi/observability";

/**
 * Registry of utility piece names → classes. Each utility file augments this
 * next to its class so `getUtility("name")` returns the right type:
 *
 * ```ts
 * declare module "#lib/module-system/Utility.js" {
 *   interface Utilities {
 *     afk: AfkUtility;
 *   }
 * }
 * ```
 */
export interface Utilities {}

/** Typed lookup for utility pieces - use instead of `container.utilities.get(...) as X`. */
export function getUtility<K extends keyof Utilities>(name: K): Utilities[K] {
  const utility = tryGetUtility(name);
  if (!utility) throw new Error(`Utility "${String(name)}" is not loaded`);
  return utility;
}

/** Like {@link getUtility} but returns undefined when the piece isn't loaded (e.g. module disabled). */
export function tryGetUtility<K extends keyof Utilities>(
  name: K,
): Utilities[K] | undefined {
  const store = container.stores?.get?.("utilities") as UtilitiesStore | undefined;
  if (store && typeof store.get === "function") {
    return store.get(name) as Utilities[K] | undefined;
  }
  return undefined;
}

/**
 * The base class that all feature utilities extend.
 * Extends Sapphire's `Utility` piece with container helpers, hot-reloading support,
 * and automatic Prometheus telemetry metrics.
 */
export class Utility extends SapphireUtility {
  public constructor(
    context: SapphireUtility.LoaderContext,
    options: SapphireUtility.Options = {},
  ) {
    super(context, options);
  }

  /** Quick accessor for the global Pino logger instance. */
  public get logger() {
    return this.container.logger;
  }

  /** Quick accessor for the global Prisma database service. */
  public get db() {
    return this.container.db;
  }

  /** Quick accessor for the global Redis client. */
  public get redis() {
    return this.container.redis;
  }

  /**
   * Instruments an async utility method with Prometheus duration and counter metrics.
   */
  protected async track<T>(method: string, fn: () => Promise<T>): Promise<T> {
    const end = utilityDuration.startTimer({ utility: this.name, method });
    try {
      const res = await fn();
      utilitiesTotal.inc({ utility: this.name, method, status: "success" });
      return res;
    } catch (err) {
      utilitiesTotal.inc({ utility: this.name, method, status: "error" });
      throw err;
    } finally {
      end();
    }
  }
}


