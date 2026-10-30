import { pino } from "pino";

export * from "./validation.js";

export interface Logger {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
  debug: (message: string, meta?: unknown) => void;
}

function write(
  instance: pino.Logger,
  level: "info" | "warn" | "error" | "debug",
  message: string,
  meta?: unknown,
): void {
  if (meta === undefined) {
    instance[level](message);
    return;
  }
  instance[level](
    typeof meta === "object" && meta !== null ? meta : { meta },
    message,
  );
}

export function createLogger(name: string): Logger {
  const instance = pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
  });
  return {
    info: (message, meta) => write(instance, "info", message, meta),
    warn: (message, meta) => write(instance, "warn", message, meta),
    error: (message, meta) => write(instance, "error", message, meta),
    debug: (message, meta) => write(instance, "debug", message, meta),
  };
}

export const logger = createLogger("lumi");
