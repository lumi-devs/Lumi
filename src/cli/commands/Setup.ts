#!/usr/bin/env bun
import { connect } from "node:net";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LUMI_ART } from "#src/lib/Branding.js";
import { ExitCodes } from "#src/lib/ExitCodes.js";
import { LumiInfo } from "#src/lib/utilities/Version.js";

export const help = `Usage: lumi setup [init [dir]] [--help]

Without arguments, runs a preflight check: verifies required secrets are
set and Postgres/Valkey are reachable. Exits 0 when ready, 78 otherwise.

  lumi setup init [dir]   Ask a few questions, then write .env and
                          compose.yml into dir (default: current directory).
                          Run it via docker with the target mounted:

  docker run --rm -it -v ./lumi:/setup ghcr.io/lumi-devs/lumi:latest lumi-setup init /setup
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

function postgresTarget(): { host: string; port: number } | { error: string } {
  const raw = process.env["POSTGRES_URL"] ?? "postgresql://lumi:lumi@postgres:5432/lumi";
  try {
    const url = new URL(raw);
    if (!url.hostname) return { error: `POSTGRES_URL has no host: ${raw}` };
    return { host: url.hostname, port: Number(url.port) || 5432 };
  } catch {
    return { error: `POSTGRES_URL is not a valid URL: ${raw}` };
  }
}

async function collectChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const token = process.env["BOT_TOKEN"] ?? "";
  checks.push({
    name: "BOT_TOKEN",
    ok: token.length >= 50,
    detail: token.length >= 50 ? "set" : "missing (real tokens are 50+ chars)",
  });
  const pg = postgresTarget();
  checks.push(
    "error" in pg
      ? { name: "Postgres", ok: false, detail: pg.error }
      : {
          name: `Postgres ${pg.host}:${pg.port}`,
          ok: await tcpReachable(pg.host, pg.port),
          detail: process.env["POSTGRES_URL"] ? "POSTGRES_URL" : "default postgres:5432",
        },
  );
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
  if (argv[0] === "init") return runInit(argv.slice(1));
  if (argv[0]) {
    console.error(`Unknown setup argument "${argv[0]}". Usage: lumi setup [init [dir]]`);
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
  console.log("\n  Ready. Start the bot:\n  docker compose up -d\n");
  return ExitCodes.SHUTDOWN;
}

async function* stdinLines(): AsyncGenerator<string> {
  let buf = "";
  for await (const chunk of process.stdin) {
    buf += String(chunk);
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      yield buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
    }
  }
}

function createAsker(): (question: string, fallback: string) => Promise<string> {
  const it = stdinLines()[Symbol.asyncIterator]();
  let eof = false;
  return async (question, fallback) => {
    const suffix = fallback ? ` [${fallback}]` : "";
    if (eof) {
      console.log(`  ${question}${suffix}: (using default)`);
      return fallback;
    }
    process.stdout.write(`  ${question}${suffix}: `);
    const next = await it.next();
    if (next.done) {
      eof = true;
      console.log();
      return fallback;
    }
    return next.value.trim() || fallback;
  };
}

function clientIdFromToken(token: string): string {
  try {
    const id = Buffer.from(token.split(".")[0] ?? "", "base64url").toString();
    return /^\d+$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

async function verifyToken(token: string): Promise<{ username: string; id: string } | null> {
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { username?: string; id?: string };
    if (typeof body.username !== "string" || typeof body.id !== "string") return null;
    return { username: body.username, id: body.id };
  } catch {
    return null;
  }
}

function composeYml(image: string): string {
  return `name: lumi
services:
  postgres:
    image: docker.io/library/postgres:18-alpine
    environment:
      POSTGRES_DB: lumi
      POSTGRES_USER: lumi
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-lumi}
    volumes:
      - postgres-data:/var/lib/postgresql
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lumi -d lumi"]
      interval: 10s
      timeout: 5s
      retries: 5

  valkey:
    image: docker.io/valkey/valkey:8-alpine
    command: valkey-server --appendonly yes --requirepass \${VALKEY_PASSWORD:-lumi}
    volumes:
      - valkey-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "valkey-cli", "-a", "\${VALKEY_PASSWORD:-lumi}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  migrate:
    image: ${image}
    command: ["bunx", "prisma", "migrate", "deploy"]
    env_file: [.env]
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  bot:
    image: ${image}
    container_name: lumi-bot
    env_file: [.env]
    environment:
      VALKEY_HOST: valkey
      POSTGRES_URL: "postgresql://lumi:\${POSTGRES_PASSWORD:-lumi}@postgres:5432/lumi"
      DIRECT_POSTGRES_URL: "postgresql://lumi:\${POSTGRES_PASSWORD:-lumi}@postgres:5432/lumi"
      RPC_HTTP_HOST: "0.0.0.0"
      RPC_HTTP_PORT: "8091"
      LOG_FORMAT: "pretty"
    depends_on:
      migrate:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres-data:
  valkey-data:
`;
}

async function runInit(argv: string[]): Promise<number> {
  const dir = path.resolve(argv[0] ?? ".");
  const image = process.env["LUMI_IMAGE"] ?? "ghcr.io/lumi-devs/lumi:latest";
  await mkdir(dir, { recursive: true });

  console.log(`\n${LUMI_ART}\n\n  Lumi v${LumiInfo.version} setup — writing to ${dir}\n`);
  const askInit = createAsker();

  try {
    let token = "";
    let verified: { username: string; id: string } | null = null;
    for (let attempt = 0; attempt < 3 && !verified; attempt++) {
      token = await askInit("Discord bot token", "");
      if (!token) continue;
      verified = await verifyToken(token);
      if (!verified) console.log("  Discord rejected that token. Try again, or leave blank to skip.");
    }
    if (verified) {
      console.log(`  Logged in as ${verified.username} (${verified.id}).`);
    } else if (token) {
      console.log("  Continuing with an unverified token — fix BOT_TOKEN before starting.");
    } else {
      console.log("  No token given — set BOT_TOKEN in .env before starting.");
    }

    const clientId = await askInit("Discord application (client) ID", verified?.id ?? clientIdFromToken(token));
    const owners = await askInit("Bot owner user IDs, comma-separated (optional)", "");
    const prefix = await askInit("Prefix-command trigger", ".");
    const pgPassword = await askInit("Postgres password", "lumi");
    const valkeyPassword = await askInit("Valkey password", "lumi");

    const envLines = [
      "# Generated by lumi-setup init. Keep this file secret.",
      `BOT_TOKEN=${token}`,
      `APPLICATION_ID=${clientId}`,
      `APPEAL_TOKEN_SECRET=${randomBytes(32).toString("hex")}`,
      `OWNER_IDS=${owners}`,
      `DEFAULT_PREFIX=${prefix}`,
      `POSTGRES_PASSWORD=${pgPassword}`,
      `POSTGRES_URL=postgresql://lumi:${pgPassword}@postgres:5432/lumi`,
      `DIRECT_POSTGRES_URL=postgresql://lumi:${pgPassword}@postgres:5432/lumi`,
      `VALKEY_HOST=valkey`,
      `VALKEY_PORT=6379`,
      `VALKEY_PASSWORD=${valkeyPassword}`,
      `RPC_INTERNAL_TOKEN=${randomBytes(32).toString("hex")}`,
      "",
    ];
    const envPath = path.join(dir, ".env");
    const composePath = path.join(dir, "compose.yml");
    await writeFile(envPath, envLines.join("\n"));
    await chmod(envPath, 0o600);
    await writeFile(composePath, composeYml(image));
    console.log(`\n  Wrote ${envPath} (mode 600) and ${composePath}.`);
    console.log(`\n  Start everything:\n  cd ${dir} && docker compose up -d\n`);
    console.log(`  Then watch it boot:\n  docker logs -f lumi-bot\n`);
    return ExitCodes.SHUTDOWN;
  } finally {
    process.stdin.destroy();
  }
}

if (import.meta.main) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.stack ?? err.message : err);
      process.exit(ExitCodes.CRITICAL);
    });
}
