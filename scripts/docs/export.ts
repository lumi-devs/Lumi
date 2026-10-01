#!/usr/bin/env bun
// Writes self-contained JSON data files consumed by the lumi-devs/Lumi-docs
// site build. The site imports no Lumi package — everything it needs about
// modules, commands, permits, RPC actions, env vars, data-privacy statements,
// and the addon SDK surface is exported here as plain JSON.
//
// Usage: bun run docs:export -- --out <dir>

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  loadManifests,
  buildModules,
  buildDataPrivacy,
  buildPermits,
  buildEnvVars,
  buildRpcActions,
  buildCommands,
  buildSdkReference,
} from "./lib";

function parseOutDir(argv: string[]): string {
  const flagIndex = argv.indexOf("--out");
  if (flagIndex === -1 || !argv[flagIndex + 1]) {
    throw new Error("usage: bun run docs:export -- --out <dir>");
  }
  return argv[flagIndex + 1]!;
}

async function writeJson(outDir: string, file: string, data: unknown): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const outDir = path.resolve(parseOutDir(process.argv.slice(2)));
  const manifests = await loadManifests();

  const [envVars, permits, rpc, commands, sdk] = await Promise.all([
    buildEnvVars(),
    buildPermits(),
    Promise.resolve(buildRpcActions()),
    buildCommands(manifests),
    buildSdkReference(),
  ]);

  await Promise.all([
    writeJson(outDir, "modules.json", buildModules(manifests)),
    writeJson(outDir, "data-privacy.json", buildDataPrivacy(manifests)),
    writeJson(outDir, "permits.json", permits),
    writeJson(outDir, "env-vars.json", envVars),
    writeJson(outDir, "rpc-actions.json", rpc),
    writeJson(outDir, "commands.json", commands),
    writeJson(outDir, "sdk-reference.json", sdk),
  ]);

  console.log(`[docs:export] wrote generated docs data to ${outDir}`);
}

await main();
