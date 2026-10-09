import type { User, Message } from "discord.js";
import { PermissionsBitField } from "discord.js";
import type { Container } from "#lib/services.js";
import { Mutex } from "@lumi/shared";
import pkg from "../../../package.json" with { type: "json" };
export const CoreVersion = pkg.version;

export function cleanMention(raw: string): string {
  return raw.replace(/[<@&#!>]/g, "");
}

const SnowflakePattern = /^\d{17,20}$/;

export function isSnowflakeId(value: unknown): value is string {
  return typeof value === "string" && SnowflakePattern.test(value);
}

export function formatAuditReason(
  actor: User,
  reason: string | null,
  maxLen = 512,
): string {
  const prefix = `[${actor.tag} | ${actor.id}] `;
  const full = prefix + (reason ?? "No reason provided.");
  if (full.length <= maxLen) return full;

  // Slicing mid-surrogate-pair leaves a lone surrogate, which throws in
  // encodeURIComponent when discord.js builds the X-Audit-Log-Reason header.
  const cut = full.charCodeAt(maxLen - 1) >= 0xd800 &&
    full.charCodeAt(maxLen - 1) <= 0xdbff
    ? maxLen - 1
    : maxLen;
  return full.slice(0, cut);
}

export const LumiInfo = {
  version: CoreVersion,
  tagline: "The next-generation modular Discord command center",
  github: "https://github.com/lumi-devs/lumi",
};

/**
 * Formats an unknown ID into a string. Returns 'unknown' if the ID is falsy.
 */
export const fmtId = (id: unknown): string => (id ? String(id) : "unknown");

export async function isModuleEnabled(
  services: Container,
  guildId: string,
  module: string,
): Promise<boolean> {
  return services.db.modules.isModuleEnabled(guildId, module);
}

export function canSendMessages(message: Message<true>): boolean {
  const { me } = message.guild.members;
  if (!me) return false;
  return (
    message.channel
      .permissionsFor(me)
      ?.has(PermissionsBitField.Flags.SendMessages) ?? false
  );
}

const queues = new Map<string, Mutex>();

function queueFor(key: string): Mutex {
  let queue = queues.get(key);
  if (!queue) queues.set(key, (queue = new Mutex()));
  return queue;
}

/** Serialize async work behind a stable key without repeating queue boilerplate. */
export async function withSerializedWork<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const queue = queueFor(key);
  await queue.wait();
  try {
    return await fn();
  } finally {
    queue.shift();
    if (queue.remaining === 0) queues.delete(key);
  }
}
