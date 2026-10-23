import pino, { type Logger } from "pino";

export type { Logger };

export interface LoggerOptions {
  name: string;
  level?: string;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino({
    name: options.name,
    level: options.level ?? process.env["LOG_LEVEL"] ?? "info",
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
