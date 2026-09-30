import type { DoctorCheckResult, DoctorStatus } from "#lib/doctor/types.js";

const StatusGlyph: Record<DoctorStatus, string> = {
  ok: "✓",
  warn: "⚠",
  fail: "✗",
  skip: "–",
};

export interface FormatDoctorReportOptions {
  /** Emit a machine-readable JSON report instead of the human-readable glyph lines. */
  json?: boolean;
}

/**
 * Renders `runDoctor()`'s results either as one `✓`/`⚠`/`✗`/`–` line per
 * check (for a terminal) or as JSON (for scripting/CI). Never throws - a
 * formatter for a diagnostics tool that itself fails would defeat the point.
 */
export function formatDoctorReport(
  results: DoctorCheckResult[],
  options: FormatDoctorReportOptions = {},
): string {
  if (options.json) {
    return JSON.stringify(results, null, 2);
  }

  return results
    .map((result) => {
      const glyph = StatusGlyph[result.status] ?? "?";
      let line = `${glyph} ${result.name}: ${result.detail}`;
      if (result.hint) line += `\n  hint: ${result.hint}`;
      return line;
    })
    .join("\n");
}

/** Non-zero (1) if any check reported `fail`; 0 otherwise - `warn`/`skip`/`ok` never fail a CI run. */
export function doctorExitCode(results: DoctorCheckResult[]): number {
  return results.some((result) => result.status === "fail") ? 1 : 0;
}
