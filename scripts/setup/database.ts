import {
  envRecord,
  isPlaceholder,
  runCommand,
} from "./shared.ts";

export function validateDatabaseUrl(value: string): string | null {
  if (value.trim().length === 0) return "Missing DATABASE_URL.";
  if (isPlaceholder(value)) {
    return "DATABASE_URL still contains a placeholder value.";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "DATABASE_URL is not a valid URL.";
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return "DATABASE_URL must start with postgres:// or postgresql://.";
  }
  if (!url.hostname) return "DATABASE_URL is missing a hostname.";
  if (url.pathname.length <= 1)
    return "DATABASE_URL is missing a database name.";
  return null;
}

export function databaseUrlFrom(values: ReadonlyMap<string, string>): string {
  return values.get("DATABASE_URL") ?? "";
}

export function envForDatabase(
  values: ReadonlyMap<string, string>,
): Record<string, string> {
  return {
    ...envRecord(values),
    DATABASE_URL: databaseUrlFrom(values),
  };
}

export async function checkDatabase(
  values: ReadonlyMap<string, string>,
): Promise<string | null> {
  const result = await runCommand(
    "bunx",
    ["prisma", "db", "execute", "--stdin"],
    envForDatabase(values),
    true,
    "SELECT 1;\n",
  );
  if (result.code === 0) return null;
  return (
    result.stderr.trim() || result.stdout.trim() || "prisma db execute failed."
  );
}
