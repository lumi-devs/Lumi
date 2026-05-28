// pino structured logger. Every line carries the service name and, when inside a
// request context, the correlationId/guildId and the active trace/span ids — so
// logs join up with traces and follow work across the (future) service split.

import { pino, type Logger as PinoLogger } from "pino";
import PinoPretty from "pino-pretty";
import { activeTraceIds, getRequestContext } from "./context.js";

export interface PinoLoggerOptions {
  service: string;
  /** pino level name. Defaults to "info". */
  level?: string;
  /** "pretty" for human-readable dev output, "json" for machine ingestion. */
  format?: "pretty" | "json";
}

export function createPinoLogger(opts: PinoLoggerOptions): PinoLogger {
  const base = {
    level: opts.level ?? "info",
    base: { service: opts.service },
    mixin() {
      const ctx = getRequestContext();
      const { traceId, spanId } = activeTraceIds();
      return {
        ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
        ...(ctx?.source ? { source: ctx.source } : {}),
        ...(ctx?.guildId ? { guildId: ctx.guildId } : {}),
        ...(ctx?.userId ? { userId: ctx.userId } : {}),
        ...(traceId ? { traceId } : {}),
        ...(spanId ? { spanId } : {}),
      };
    },
  };

  if (opts.format === "pretty") {
    // Synchronous stream (no worker thread) — robust under Bun.
    return pino(
      base,
      PinoPretty({
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname,service",
        messageFormat: "[{service}] {msg}",
      }),
    );
  }

  return pino(base);
}

export type { PinoLogger };
