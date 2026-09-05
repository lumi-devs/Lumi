import { LogLevel, type ILogger } from "@sapphire/framework";
import { createPinoLogger, type PinoLogger } from "@lumi/observability";
import { isDevelopment } from "#lib/env.js";

type PinoMethod = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LevelToPino: Record<LogLevel, PinoMethod> = {
  [LogLevel.Trace]: "trace",
  [LogLevel.Debug]: "debug",
  [LogLevel.Info]: "info",
  [LogLevel.Warn]: "warn",
  [LogLevel.Error]: "error",
  [LogLevel.Fatal]: "fatal",
  [LogLevel.None]: "info",
};

export class PinoSapphireLogger implements ILogger {
  public readonly pino: PinoLogger;
  public level: LogLevel;

  public constructor(service: string, level: LogLevel = LogLevel.Info) {
    this.level = level;
    const format = isDevelopment() ? "pretty" : "json";
    this.pino = createPinoLogger({ service, level: LevelToPino[level] ?? "info", format });
  }

  public has(level: LogLevel): boolean {
    return level >= this.level;
  }

  public write(level: LogLevel, ...values: readonly unknown[]): void {
    if (!this.has(level)) return;
    const method = LevelToPino[level] ?? "info";
    if (typeof values[0] === "string") {
      const [msg, ...rest] = values;
      if (rest.length === 1 && typeof rest[0] === "object" && rest[0] !== null) {
        this.pino[method](rest[0], msg);
      } else if (rest.length > 0) {
        this.pino[method]({ extra: rest }, msg);
      } else {
        this.pino[method](msg);
      }
    } else if (values.length === 1 && typeof values[0] === "object" && values[0] !== null) {
      this.pino[method](values[0]);
    } else {
      this.pino[method]({ values });
    }
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
}
