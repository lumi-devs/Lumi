// Pino structured logger factory with request context and OpenTelemetry trace propagation.


import { createRequire } from "node:module";
import { pino, type Logger as PinoLogger } from "pino";
import { activeTraceIds, getRequestContext } from "./context";

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
    const require = createRequire(import.meta.url);
    const PinoPretty = require("pino-pretty") as typeof import("pino-pretty");
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
