import { LogLevel, type ILogger } from "#src/shared/Index.ts";
import { isDevelopment } from "#src/lib/Env.js";

const StringToLevel: Record<string, LogLevel> = {
  trace: LogLevel.Trace,
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
  fatal: LogLevel.Fatal,
};

function resolveLogLevel(): LogLevel {
  const envLevel = process.env["LOG_LEVEL"]?.trim().toLowerCase();
  if (envLevel && envLevel in StringToLevel) {
    return StringToLevel[envLevel]!;
  }
  return isDevelopment() ? LogLevel.Debug : LogLevel.Info;
}

export class LumiLogger implements ILogger {
  public level: LogLevel;
  readonly #service: string;

  public constructor(service: string) {
    this.#service = service;
    this.level = resolveLogLevel();
  }

  public has(level: LogLevel): boolean {
    return level >= this.level;
  }

  public write(level: LogLevel, ...values: readonly unknown[]): void {
    if (!this.has(level)) return;
    const time = new Date().toISOString();
    const prefix = `[${time}] [${this.#service}] [${LogLevel[level] ?? "INFO"}]`;
    if (level >= LogLevel.Error) {
      console.error(prefix, ...values);
    } else if (level === LogLevel.Warn) {
      console.warn(prefix, ...values);
    } else {
      console.log(prefix, ...values);
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

export const LumiPinoLogger = LumiLogger;
