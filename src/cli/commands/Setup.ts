#!/usr/bin/env bun
import { connect } from "node:net";
import { LUMI_ART } from "#src/lib/Branding.js";
import { ExitCodes } from "#src/lib/ExitCodes.js";
import { LumiInfo } from "#src/lib/utilities/Version.js";

export const help = `Usage: lumi setup [--help]

Preflight check for a Docker-first install. Verifies required secrets are
set and Postgres/Valkey are reachable, then prints next steps.

Exits 0 when ready, 78 when configuration is missing or unreachable.
`;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function tcpReachable(host: string, port: number, timeoutMs = 5_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function postgresTarget(): { host: string; port: number } {
  const raw = process.env["POSTGRES_URL"] ?? "postgresql://lumi:lumi@postgres:5432/lumi";
  try {
    const url = new URL(raw);
    return { host: url.hostname || "postgres", port: Number(url.port) || 5432 };
  } catch {
    return { host: "postgres", port: 5432 };
  }
}

async function collectChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const token = process.env["BOT_TOKEN"] ?? "";
  checks.push({
    name: "BOT_TOKEN",
    ok: token.length >= 20,
    detail: token.length >= 20 ? "set" : "missing or too short",
  });
  const pg = postgresTarget();
  checks.push({
    name: `Postgres ${pg.host}:${pg.port}`,
    ok: await tcpReachable(pg.host, pg.port),
    detail: process.env["POSTGRES_URL"] ? "POSTGRES_URL" : "default postgres:5432",
  });
  const valkeyHost = process.env["VALKEY_HOST"] ?? "valkey";
  const valkeyPort = Number(process.env["VALKEY_PORT"] ?? 6379);
  checks.push({
    name: `Valkey ${valkeyHost}:${valkeyPort}`,
    ok: await tcpReachable(valkeyHost, valkeyPort),
    detail: process.env["VALKEY_HOST"] ? "VALKEY_HOST" : "default valkey:6379",
  });
  const rpcToken = process.env["RPC_INTERNAL_TOKEN"] ?? "";
  checks.push({
    name: "RPC_INTERNAL_TOKEN",
    ok: rpcToken.length >= 16,
    detail: rpcToken.length >= 16 ? "set" : "missing (dashboard bridge disabled)",
  });
  return checks;
}

export async function run(argv: string[]): Promise<number> {
  if (argv[0] === "--help" || argv[0] === "-h") {
    console.log(help);
    return ExitCodes.SHUTDOWN;
  }
  if (argv[0]) {
    console.error(`Unknown setup argument "${argv[0]}". Usage: lumi setup`);
    return ExitCodes.INVALID_CLI_USAGE;
  }

  console.log(`\n${LUMI_ART}\n\n  Lumi v${LumiInfo.version} setup preflight\n`);
  const checks = await collectChecks();
  for (const check of checks) {
    console.log(`  [${check.ok ? "PASS" : "FAIL"}] ${check.name} (${check.detail})`);
  }
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.log(
      `\n  ${failed.length} check(s) failed. Start dependencies first:\n  docker compose up -d postgres valkey\n`,
    );
    return ExitCodes.CONFIG_ERROR;
  }
  console.log("\n  Ready. Start the bot:\n  docker compose up -d --build\n");
  return ExitCodes.SHUTDOWN;
}

if (import.meta.main) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.stack ?? err.message : err);
      process.exit(ExitCodes.CRITICAL);
    });
}
