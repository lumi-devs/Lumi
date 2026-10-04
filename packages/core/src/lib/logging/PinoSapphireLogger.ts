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

const PinoToLevel: Record<PinoMethod, LogLevel> = {
  trace: LogLevel.Trace,
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
  fatal: LogLevel.Fatal,
};

function resolveLevel(): PinoMethod {
  const raw = process.env["LOG_LEVEL"]?.trim().toLowerCase();
  if (!raw) return isDevelopment() ? "debug" : "info";
  if (raw in PinoToLevel) return raw as PinoMethod;
  throw new Error(`[ENV] Invalid LOG_LEVEL=${raw} (expected ${Object.keys(PinoToLevel).join(", ")})`);
}

function resolveFormat(): "pretty" | "json" {
  const raw = process.env["LOG_FORMAT"]?.trim().toLowerCase();
  if (!raw) return isDevelopment() ? "pretty" : "json";
  if (raw === "pretty" || raw === "json") return raw;
  throw new Error(`[ENV] Invalid LOG_FORMAT=${raw} (expected pretty, json)`);
}

export type ShardLogEntry = {
  timestamp: string;
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
};

export class PinoSapphireLogger implements ILogger {
  public static readonly listeners = new Set<(entry: ShardLogEntry) => void>();

  public static addListener(listener: (entry: ShardLogEntry) => void): () => void {
    PinoSapphireLogger.listeners.add(listener);
    return () => PinoSapphireLogger.listeners.delete(listener);
  }

  public readonly pino: PinoLogger;
  public level: LogLevel;

  public constructor(service: string) {
    const level = resolveLevel();
    this.level = PinoToLevel[level];
    this.pino = createPinoLogger({ service, level, format: resolveFormat() });
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

    if (PinoSapphireLogger.listeners.size > 0) {
      const rawMsg =
        typeof values[0] === "string"
          ? values[0]
          : typeof values[0] === "object" && values[0] !== null && "msg" in values[0]
            ? String((values[0] as { msg: unknown }).msg)
            : JSON.stringify(values[0]);
      const entry: ShardLogEntry = {
        timestamp: new Date().toISOString(),
        level: method,
        message: rawMsg,
      };
      for (const listener of PinoSapphireLogger.listeners) {
        try {
          listener(entry);
        } catch {}
      }
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
