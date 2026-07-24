import { LogLevel, type ILogger } from "@sapphire/framework";
import { createPinoLogger, type PinoLogger } from "@lumi/observability";

export class PinoSapphireLogger implements ILogger {
  public readonly pino: PinoLogger;
  public level: LogLevel;

  public constructor(service: string, level: LogLevel = LogLevel.Info) {
    this.level = level;
    const format =
      process.env["NODE_ENV"] === "development" ? "pretty" : "json";
    const pinoLevel = levelToPino(level);
    this.pino = createPinoLogger({ service, level: pinoLevel, format });
  }

  public has(level: LogLevel): boolean {
    return level >= this.level;
  }

  public write(level: LogLevel, ...values: readonly unknown[]): void {
    if (!this.has(level)) return;
    const method = levelToMethod(level);
    if (typeof values[0] === "string") {
      const [msg, ...rest] = values;
      if (
        rest.length === 1 &&
        typeof rest[0] === "object" &&
        rest[0] !== null
      ) {
        this.pino[method](rest[0], msg);
      } else if (rest.length > 0) {
        this.pino[method]({ extra: rest }, msg);
      } else {
        this.pino[method](msg);
      }
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

function levelToPino(level: LogLevel): string {
  switch (level) {
    case LogLevel.Trace:
      return "trace";
    case LogLevel.Debug:
      return "debug";
    case LogLevel.Info:
      return "info";
    case LogLevel.Warn:
      return "warn";
    case LogLevel.Error:
      return "error";
    case LogLevel.Fatal:
      return "fatal";
    default:
      return "info";
  }
}

function levelToMethod(
  level: LogLevel,
): "trace" | "debug" | "info" | "warn" | "error" | "fatal" {
  switch (level) {
    case LogLevel.Trace:
      return "trace";
    case LogLevel.Debug:
      return "debug";
    case LogLevel.Info:
      return "info";
    case LogLevel.Warn:
      return "warn";
    case LogLevel.Error:
      return "error";
    case LogLevel.Fatal:
      return "fatal";
    default:
      return "info";
  }
}
