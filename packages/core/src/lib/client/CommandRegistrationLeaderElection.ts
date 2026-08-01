import { CommandRegistrationLock } from "#lib/command-registration-lock.js";
import { createRedisClient } from "#lib/database/redis.js";
import {
  envParseInteger,
  getClusterName,
  getConsumerId,
  type ServiceRole,
} from "#lib/env.js";
import { container, type StoreRegistry } from "@sapphire/framework";
import { warnOnCleanupError } from "./cleanup.js";
import { suppressCommandRegistration } from "./command-registration-gate.js";

/**
 * Elects the single replica allowed to push application commands to Discord.
 *
 * @remarks
 *
 * The protocol runs exactly once, from `login()`, and in this order:
 *
 * 1. Outside the `worker` role, or outside a cluster, the election is a no-op -
 *    a lone process always registers.
 * 2. Otherwise a renewing Redis lock is contended for. The winner keeps it for
 *    the lifetime of the process and hands it back in {@linkcode release}.
 * 3. Losers install the suppression gate, so their command pieces still load
 *    and dispatch by name but never hit Discord's registration routes. This is
 *    why {@linkcode elect} must be awaited *before* the stores are loaded.
 * 4. If Redis is unreachable the replica registers unguarded - starting with
 *    stale commands is preferable to starting with none.
 *
 * The lock instance is retained even when the election is lost, because the
 * losing replica still holds a renewal timer that has to be torn down.
 */
export class CommandRegistrationLeaderElection {
  /** Role of the owning client; only `worker` registers commands. */
  protected readonly role: ServiceRole;

  /** Store registry the suppression gate is loaded into. */
  protected readonly stores: StoreRegistry;

  #lock: CommandRegistrationLock | null = null;

  public constructor(options: CommandRegistrationLeaderElection.Options) {
    this.role = options.role;
    this.stores = options.stores;
  }

  /**
   * Contends for the registration lock and, when lost, suppresses this
   * replica's command registration.
   */
  public async elect(): Promise<void> {
    if (this.role !== "worker" || !getClusterName()) return;

    this.#lock = new CommandRegistrationLock({
      redis: createRedisClient(),
      replicaId: getConsumerId(),
      ttlMs: envParseInteger("COMMAND_REGISTRATION_LOCK_TTL_MS", 30_000),
      renewIntervalMs: envParseInteger(
        "COMMAND_REGISTRATION_LOCK_RENEW_MS",
        10_000,
      ),
      log: (level, msg, meta) => container.logger[level](msg, meta),
    });

    const acquired = await this.#lock.tryAcquire().catch((err: unknown) => {
      container.logger.warn(
        "[CommandLock] Redis unavailable; registering commands unguarded:",
        err,
      );
      return true;
    });
    if (!acquired) await suppressCommandRegistration(this.stores);
  }

  /** Releases the lock if one was taken. Never rejects. */
  public async release(): Promise<void> {
    if (!this.#lock) return;
    await this.#lock
      .release()
      .catch(warnOnCleanupError("CommandRegistrationLock release"));
    this.#lock = null;
  }
}

export namespace CommandRegistrationLeaderElection {
  export interface Options {
    /** Role of the owning client. */
    role: ServiceRole;
    /** Store registry the suppression gate is loaded into. */
    stores: StoreRegistry;
  }
}
