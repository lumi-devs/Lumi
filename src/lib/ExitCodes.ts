export const ExitCodes = {
  SHUTDOWN: 0,
  CRITICAL: 1,
  INVALID_CLI_USAGE: 2,
  RESTART: 26,
  CONFIG_ERROR: 78,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];
