import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ENV_FILE = path.join(REPO_ROOT, "packages/core/src/lib/env.ts");

export const help = `Usage: lumi config

Prints every environment variable \`packages/core/src/lib/env.ts\` reads
(discovered by scanning that file, so the list can never drift from the
real accessors) along with its currently resolved value.

Secrets are redacted: any key whose name contains "token", "secret",
"password" or "key" prints as "***redacted***", and any *_URL value
containing embedded user:pass@ credentials has just the credentials
redacted (the rest of the URL, e.g. host/db name, still prints).
`;

const SECRET_KEY_RE = /token|secret|password|key/i;
const URL_CREDENTIALS_RE = /:\/\/([^:@/\s]+):([^@/\s]+)@/g;

function redactUrlCredentials(value: string): string {
  return value.replace(URL_CREDENTIALS_RE, "://***:***@");
}

export function redactValue(key: string, value: string): string {
  if (SECRET_KEY_RE.test(key)) return "***redacted***";
  if (value.includes("://")) return redactUrlCredentials(value);
  return value;
}

/**
 * Scans `env.ts` for every literal env var key it reads - both direct
 * `process.env["KEY"]` indexing and this file's own thin parser helpers
 * (`envParseString`/`envParseInteger`), which take the key as their first
 * string-literal argument. Keeps `lumi config`'s key list identical to the
 * real accessors instead of a second hand-maintained list that can drift.
 */
export async function discoverEnvKeys(file: string = ENV_FILE): Promise<string[]> {
  const src = await fs.readFile(file, "utf8");
  const keys = new Set<string>();
  const directRe = /process\.env\[\s*["']([A-Z0-9_]+)["']\s*\]/g;
  const helperRe = /env(?:ParseString|ParseInteger)\(\s*["']([A-Z0-9_]+)["']/g;
  for (const re of [directRe, helperRe]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(src))) {
      const key = match[1];
      if (key) keys.add(key);
    }
  }
  return [...keys].sort();
}

export async function run(argv: string[]): Promise<number> {
  if (argv[0] === "--help" || argv[0] === "-h") {
    console.log(help);
    return 0;
  }
  if (argv[0]) {
    console.error(help);
    return 2;
  }

  const keys = await discoverEnvKeys();
  const width = Math.max(4, ...keys.map((k) => k.length));
  for (const key of keys) {
    const raw = process.env[key];
    const printed = raw === undefined ? "(not set)" : redactValue(key, raw);
    console.log(`${key.padEnd(width)}  ${printed}`);
  }
  return 0;
}
