/**
 * ANSI Color Codes and Formatting Utilities for Discord Code Blocks
 *
 * Discord supports ANSI escape codes inside ```ansi code blocks.
 * Use `codeBlockAnsi()` to wrap content, and `formatAnsi()` to style individual strings.
 *
 * Supported in Desktop clients since late 2023.
 */
export const AnsiColors = {
  RESET: "\u001b[0m",

  // ── Text Styles ───────────────────────────────────────────────────────────
  BOLD: "\u001b[1m",
  UNDERLINE: "\u001b[4m",

  // ── Foreground Colors ─────────────────────────────────────────────────────
  GRAY: "\u001b[90m",
  RED: "\u001b[31m",
  GREEN: "\u001b[32m",
  YELLOW: "\u001b[33m",
  BLUE: "\u001b[34m",
  PINK: "\u001b[35m",
  CYAN: "\u001b[36m",
  WHITE: "\u001b[37m",

  // ── Background Colors ─────────────────────────────────────────────────────
  BG_DARK_BLUE: "\u001b[40m",
  BG_ORANGE: "\u001b[41m",
  BG_LIGHT_BLUE: "\u001b[42m",
  BG_GREYISH_TURQUOISE: "\u001b[43m",
  BG_GREYISH_BLUE: "\u001b[44m",
  BG_INDIGO: "\u001b[45m",
  BG_LIGHT_GREY: "\u001b[46m",
  BG_WHITE: "\u001b[47m",
} as const;

export type AnsiStyle = (typeof AnsiColors)[keyof typeof AnsiColors];

/**
 * Formats a string with specified ANSI escape styles and closes with a RESET.
 *
 * @example
 * formatAnsi('ONLINE', AnsiColors.BOLD, AnsiColors.GREEN) // → bold green "ONLINE"
 */
export function formatAnsi(text: string, ...styles: AnsiStyle[]): string {
  return `${styles.join("")}${text}${AnsiColors.RESET}`;
}

/**
 * Wraps content in a Discord ANSI code block.
 *
 * @example
 * codeBlockAnsi('hello world') // → ```ansi\nhello world\n```
 */
export function codeBlockAnsi(text: string): string {
  return `\`\`\`ansi\n${text}\n\`\`\``;
}

// ── Pre-built composite formatters ────────────────────────────────────────────

/**
 * Build a padded key-value row suitable for a terminal-style readout.
 * @param label  The label (left column), padded to `padWidth`.
 * @param value  The value (right column), coloured based on `status`.
 * @param status Controls value colour: 'ok' = green, 'warn' = yellow, 'err' = red, 'info' = cyan.
 * @param padWidth Pad label to this width (default 20).
 */
export function ansiRow(
  label: string,
  value: string,
  status: "ok" | "warn" | "err" | "info" | "neutral" = "neutral",
  padWidth = 20,
): string {
  const colorMap: Record<string, AnsiStyle> = {
    ok: AnsiColors.GREEN,
    warn: AnsiColors.YELLOW,
    err: AnsiColors.RED,
    info: AnsiColors.CYAN,
    neutral: AnsiColors.WHITE,
  };
  const paddedLabel = formatAnsi(label.padEnd(padWidth), AnsiColors.GRAY);
  const coloredValue = formatAnsi(value, colorMap[status] ?? AnsiColors.WHITE);
  return `${paddedLabel}${coloredValue}`;
}

/**
 * Build a bold section header for ANSI terminal blocks.
 *
 * @example
 * ansiHeader('NETWORK') // → bold cyan "═══ NETWORK ════════════════════════"
 */
export function ansiHeader(title: string, char = "═", width = 38): string {
  const inner = ` ${title} `;
  const sides = Math.max(0, width - inner.length);
  const left = char.repeat(3);
  const right = char.repeat(Math.max(0, sides - 3));
  return formatAnsi(
    `${left}${inner}${right}`,
    AnsiColors.BOLD,
    AnsiColors.CYAN,
  );
}

/**
 * Build a standard terminal-style ANSI block with a header and rows.
 * Wraps the result in an ```ansi code block automatically.
 *
 * @example
 * buildTerminalBlock('DIAGNOSTICS', [
 *   ['Status', 'ONLINE', 'ok'],
 *   ['Latency', '42ms', 'ok'],
 *   ['Queue', 'DEGRADED', 'warn'],
 * ])
 */
export function buildTerminalBlock(
  title: string,
  rows: [
    label: string,
    value: string,
    status?: "ok" | "warn" | "err" | "info" | "neutral",
  ][],
): string {
  const lines = [
    ansiHeader(title),
    ...rows.map(([l, v, s]) => ansiRow(l, v, s ?? "neutral")),
  ];
  return codeBlockAnsi(lines.join("\n"));
}
