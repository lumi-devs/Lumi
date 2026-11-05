import type { Logger } from "@lumi/foundation";

export interface ShutdownStep {
  readonly name: string;
  readonly action: () => unknown | Promise<unknown>;
}

export function registerShutdownHandlers(
  logger: Logger,
  steps: readonly ShutdownStep[],
): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      try {
        for (const step of steps) {
          try {
            await step.action();
          } catch (error) {
            logger.error("Shutdown step failed", {
              step: step.name,
              error,
            });
          }
        }
      } finally {
        process.exit(0);
      }
    });
  }
}
