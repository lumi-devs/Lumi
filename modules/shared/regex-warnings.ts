import type { ModuleServices } from "@lumi/module-kit";
import { invalidRegexPatterns } from "./regex.js";

const warned = new Set<string>();
const MaxWarnings = 500;

export function warnInvalidRegexPatterns(
  services: ModuleServices,
  label: string,
  guildId: string,
  field: string,
  patterns: readonly string[],
  flags = "i",
): void {
  for (const invalid of invalidRegexPatterns(patterns, flags)) {
    const key = `${guildId}:${field}:${invalid.pattern}:${invalid.error}`;
    if (warned.has(key)) continue;
    if (warned.size >= MaxWarnings) warned.clear();
    warned.add(key);
    services.observability?.logger?.warn?.(
      `[${label}] ignoring invalid stored regex pattern`,
      {
        guildId,
        field,
        pattern: invalid.pattern,
        error: invalid.error,
      },
    );
  }
}
