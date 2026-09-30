#!/usr/bin/env bun
// CI drift check: fails the build if the hand-maintained env-var docs
// metadata in lib.ts no longer matches the env vars actually read by worker
// source. Writes nothing; see export.ts for the JSON data export used by the
// docs site build.

import { buildEnvVars } from "./lib";

try {
  await buildEnvVars();
  console.log("[docs:check] environment variable reference matches source.");
} catch (err) {
  console.error(`[docs:check] ${(err as Error).message}`);
  process.exit(1);
}
