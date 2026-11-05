import { createInterface } from "node:readline/promises";
import { databaseUrlFrom, validateDatabaseUrl } from "./database.ts";
import { validateBotToken, validateOwnerIds } from "./discord.ts";
import { validateEnv } from "./env.ts";
import { redisUrlFrom, validateRedisUrl } from "./redis.ts";
import {
  DefaultDatabaseUrl,
  DefaultRedisUrl,
  type EnvIssue,
  mergedValues,
} from "./shared.ts";

async function readVisible(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = await readline.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue || "";
  } finally {
    readline.close();
  }
}

async function readSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return readVisible(question);
  }

  process.stdout.write(`${question}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const { promise, resolve } = Promise.withResolvers<string>();
  let value = "";
  const cleanup = (): void => {
    process.stdin.off("data", onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
  const onData = (chunk: Buffer): void => {
    for (const char of chunk.toString("utf8")) {
      if (char === "\r" || char === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u0003") {
        cleanup();
        process.stdout.write("\n");
        process.exit(130);
      }
      if (char === "\u007f" || char === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        continue;
      }
      if (char >= " ") {
        value += char;
        process.stdout.write("*");
      }
    }
  };
  process.stdin.on("data", onData);
  return promise;
}

export async function confirm(
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  const answer = (
    await readVisible(`${question} (${defaultYes ? "Y/n" : "y/N"})`)
  ).toLowerCase();
  if (answer.length === 0) return defaultYes;
  return answer === "y" || answer === "yes";
}

function validateKey(key: string, value: string): string | null {
  switch (key) {
    case "BOT_TOKEN":
      return validateBotToken(value);
    case "OWNER_IDS":
      return validateOwnerIds(value);
    case "DATABASE_URL":
      return validateDatabaseUrl(value);
    case "REDIS_URL":
      return validateRedisUrl(value);
    default:
      return null;
  }
}

async function promptRequired(
  key: string,
  label: string,
  secret: boolean,
  defaultValue: string | undefined,
  updates: Record<string, string>,
  values: Map<string, string>,
): Promise<void> {
  for (;;) {
    const answer = secret
      ? await readSecret(label)
      : await readVisible(label, defaultValue);
    const value = answer.trim() || defaultValue || "";
    const error = validateKey(key, value);
    if (error === null) {
      updates[key] = value;
      values.set(key, value);
      return;
    }
    process.stderr.write(`  ${error}\n`);
  }
}

export async function collectRequired(
  values: Map<string, string>,
  updates: Record<string, string>,
  interactive: boolean,
): Promise<EnvIssue[]> {
  const effective = mergedValues(values, updates);
  const prompts: Array<{
    key: string;
    label: string;
    secret: boolean;
    defaultValue?: string;
    missing: boolean;
  }> = [
    {
      key: "BOT_TOKEN",
      label: "Discord bot token",
      secret: true,
      missing: validateBotToken(effective.get("BOT_TOKEN") ?? "") !== null,
    },
    {
      key: "OWNER_IDS",
      label: "Your Discord user ID(s), comma separated",
      secret: false,
      missing: validateOwnerIds(effective.get("OWNER_IDS") ?? "") !== null,
    },
    {
      key: "DATABASE_URL",
      label: "PostgreSQL URL",
      secret: false,
      defaultValue: DefaultDatabaseUrl,
      missing: validateDatabaseUrl(databaseUrlFrom(effective)) !== null,
    },
    {
      key: "REDIS_URL",
      label: "Redis URL",
      secret: false,
      defaultValue: DefaultRedisUrl,
      missing:
        redisUrlFrom(effective).length === 0 ||
        validateRedisUrl(redisUrlFrom(effective)) !== null,
    },
  ];

  for (const prompt of prompts) {
    if (!prompt.missing) continue;
    const existing = effective.get(prompt.key) ?? "";
    if (prompt.key === "REDIS_URL" && (effective.get("REDIS_HOST") ?? "")) {
      continue;
    }
    if (!interactive) continue;
    process.stdout.write(`\n${prompt.label}\n`);
    if (existing.length > 0) {
      process.stdout.write(`  Current value is invalid; enter a new one.\n`);
    }
    await promptRequired(
      prompt.key,
      prompt.label,
      prompt.secret,
      prompt.defaultValue,
      updates,
      values,
    );
  }

  return validateEnv(mergedValues(values, updates));
}
