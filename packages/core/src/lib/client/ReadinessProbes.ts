import { roleOwnsScheduler, type ServiceRole } from "#lib/env.js";
import type { SchedulerLeaderLock } from "#lib/scheduler-leader-lock.js";
import { registerReadinessProbe } from "@lumi/observability";
import { container } from "@sapphire/framework";

/**
 * Declares the `/readyz` probes a client replica answers with.
 *
 * @remarks
 *
 * {@linkcode register} runs once, at the tail of `login()`, so that every
 * dependency a probe reports on already exists. Which probes are declared
 * depends on the role: only the worker holds a gateway connection, and only a
 * scheduler that actually took the leader lock can report on leadership.
 *
 * Probes reach their dependency through the suppliers passed in rather than
 * capturing it, because the client releases those handles during shutdown and
 * a probe must observe that rather than a stale reference.
 */
export class ReadinessProbes {
  /** Role of the owning client; decides which probes are declared. */
  protected readonly role: ServiceRole;

  /** Whether the gateway connection is usable. Worker role only. */
  protected readonly isReady: () => boolean;

  /** The scheduler leader lock, or `null` when this replica took none. */
  protected readonly schedulerLeaderLock: () => SchedulerLeaderLock | null;

  public constructor(options: ReadinessProbes.Options) {
    this.role = options.role;
    this.isReady = options.isReady;
    this.schedulerLeaderLock = options.schedulerLeaderLock;
  }

  /** Declares every probe applicable to the owning client's role. */
  public register(): void {
    this.registerInfrastructureProbes();
    this.registerRoleProbes();
  }

  /** Declares the probes shared by every role: the backing services. */
  protected registerInfrastructureProbes(): void {
    // `/readyz` is reachable by anyone who can reach the metrics port, so probe
    // details are fixed classifications. Driver errors are logged instead:
    // stringified connection failures embed host, port, database and sometimes
    // the credentials from the connection string.
    registerReadinessProbe("postgres", async () => {
      try {
        await container.db.probePrisma();
        return { status: "ok" };
      } catch (err) {
        container.logger?.error("[Readiness] postgres probe failed:", err);
        return { status: "fail", detail: "database unreachable" };
      }
    });

    registerReadinessProbe("redis", async () => {
      try {
        const pong = await container.redis.ping();
        if (pong === "PONG") return { status: "ok" };
        container.logger?.error(
          `[Readiness] redis probe returned unexpected reply: ${pong}`,
        );
        return { status: "fail", detail: "redis unreachable" };
      } catch (err) {
        container.logger?.error("[Readiness] redis probe failed:", err);
        return { status: "fail", detail: "redis unreachable" };
      }
    });
  }

  /** Declares the probes only some roles can meaningfully answer. */
  protected registerRoleProbes(): void {
    if (this.role === "worker") {
      registerReadinessProbe("discord", () =>
        this.isReady()
          ? { status: "ok" }
          : { status: "fail", detail: "client not ready" },
      );
    }

    if (!roleOwnsScheduler(this.role)) return;

    registerReadinessProbe("scheduler-tasks", () =>
      container.tasks
        ? { status: "ok" }
        : { status: "fail", detail: "tasks store missing" },
    );

    if (this.schedulerLeaderLock()) {
      registerReadinessProbe("scheduler-leader", () =>
        this.schedulerLeaderLock()?.isLeader()
          ? { status: "ok" }
          : { status: "fail", detail: "not leader" },
      );
    }
  }
}

export namespace ReadinessProbes {
  export interface Options {
    /** Role of the owning client. */
    role: ServiceRole;
    /** Reads the client's current gateway readiness. */
    isReady: () => boolean;
    /** Reads the client's scheduler leader lock, if it holds one. */
    schedulerLeaderLock: () => SchedulerLeaderLock | null;
  }
}
