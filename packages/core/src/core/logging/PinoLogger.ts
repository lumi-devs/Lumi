// Sapphire ILogger backed by pino, so `container.logger` emits structured,
// trace-correlated JSON instead of plain console lines. The pino instance owns
// level filtering + the correlation/trace mixin (see @ember/observability).

import { LogLevel, type ILogger } from "@sapphire/framework";
import { createPinoLogger, type PinoLogger } from "@ember/observability";
import { envParseString } from "#lib/env.js";

type PinoLevelName = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_TO_PINO: Record<number, PinoLevelName> = {
  [LogLevel.Trace]: "trace",
  [LogLevel.Debug]: "debug",
  [LogLevel.Info]: "info",
  [LogLevel.Warn]: "warn",
  [LogLevel.Error]: "error",
  [LogLevel.Fatal]: "fatal",
};

export class PinoSapphireLogger implements ILogger {
  private readonly pino: PinoLogger;

  public constructor(pinoInstance?: PinoLogger) {
    const isProd = envParseString("NODE_ENV", "development") === "production";
    this.pino =
      pinoInstance ??
      createPinoLogger({
        service: envParseString("SERVICE_NAME", "worker"),
        level: envParseString("LOG_LEVEL", isProd ? "info" : "debug"),
        format: (envParseString("LOG_FORMAT", isProd ? "json" : "pretty") ===
        "json"
          ? "json"
          : "pretty") as "json" | "pretty",
      });
  }

  public has(level: LogLevel): boolean {
    const name = LEVEL_TO_PINO[level];
    return name ? this.pino.isLevelEnabled(name) : false;
  }

  public trace(...values: readonly unknown[]): void {
    this.write(LogLevel.Trace, ...values);
  }

  public debug(...values: readonly unknown[]): void {
    this.write(LogLevel.Debug, ...values);
  }

  public info(...values: readonly unknown[]): void {
    this.write(LogLevel.Info, ...values);
  }

  public warn(...values: readonly unknown[]): void {
    this.write(LogLevel.Warn, ...values);
  }

  public error(...values: readonly unknown[]): void {
    this.write(LogLevel.Error, ...values);
  }

  public fatal(...values: readonly unknown[]): void {
    this.write(LogLevel.Fatal, ...values);
  }

  public write(level: LogLevel, ...values: readonly unknown[]): void {
    const name = LEVEL_TO_PINO[level];
    if (!name || !this.pino.isLevelEnabled(name)) return;

    const errors = values.filter((v): v is Error => v instanceof Error);
    const message = values
      .filter((v) => !(v instanceof Error))
      .map((v) => (typeof v === "string" ? v : safeStringify(v)))
      .join(" ");

    const bindings =
      errors.length === 0
        ? {}
        : { err: errors.length === 1 ? errors[0] : errors };

    this.pino[name](bindings, message);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
