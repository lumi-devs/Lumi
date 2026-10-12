#!/usr/bin/env bun

import path from "node:path";
import { validateAddonOrRepo } from "#src/lib/downloader/Validate.js";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export async function runValidateAddon(argv: string[]): Promise<number> {
  const target = argv[0];
  if (!target) {
    console.error("Usage: bun run validate <addon-dir | repo-dir>");
    return 2;
  }

  const abs = path.resolve(target);
  const results = await validateAddonOrRepo(abs);

  if (results.size === 0) {
    console.error(
      `${RED}No addons found at ${abs}${RESET} (expected a manifest.json here or in a subdirectory).`,
    );
    return 2;
  }

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const [name, { errors, warnings }] of results) {
    totalErrors += errors.length;
    totalWarnings += warnings.length;
    const badge =
      errors.length > 0
        ? `${RED}✗ FAIL${RESET}`
        : warnings.length > 0
          ? `${YELLOW}⚠ WARN${RESET}`
          : `${GREEN}✓ PASS${RESET}`;
    console.log(`\n${badge}  ${name}`);
    for (const e of errors) console.log(`  ${RED}error${RESET}  ${e}`);
    for (const w of warnings) console.log(`  ${YELLOW}warn ${RESET}  ${w}`);
    if (!errors.length && !warnings.length)
      console.log(`  ${DIM}no issues${RESET}`);
  }

  console.log(
    `\n${results.size} addon(s) · ${totalErrors} error(s) · ${totalWarnings} warning(s)`,
  );
  return totalErrors > 0 ? 1 : 0;
}

if (import.meta.main) {
  void runValidateAddon(process.argv.slice(2)).then((code) => process.exit(code));
}
