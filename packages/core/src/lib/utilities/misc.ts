import type { User, Message } from "discord.js";
import { PermissionsBitField } from "discord.js";
import { isGuildBasedChannel } from "@sapphire/discord.js-utilities";
import { checkModulesEnabled } from "#lib/module-check.js";
import { AsyncQueue } from "@sapphire/async-queue";
import { createRequire } from "node:module";

const _req = createRequire(import.meta.url);
// Changesets bumps packages/core/package.json on every release merge - the
// single source of truth for this number, never hand-edit it elsewhere.
const corePackageVersion = (
  _req("../../../package.json") as { version: string }
).version;

export function cleanMention(raw: string): string {
  return raw.replace(/[<@&#!>]/g, "");
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
  version: corePackageVersion,
  codename: "Elysian",
  tagline: "The next-generation modular Discord command center",
  inception: new Date("2026-07-11T07:50:00Z"),
  github: "https://github.com/lumi-devs/lumi",
  getAgeInDays(): number {
    const diff = Date.now() - this.inception.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  },
};

/**
 * Formats an unknown ID into a string. Returns 'unknown' if the ID is falsy.
 */
export const fmtId = (id: unknown): string => (id ? String(id) : "unknown");

export async function isModuleEnabled(
  guildId: string,
  module: string,
): Promise<boolean> {
  const states = await checkModulesEnabled(guildId, [module]);
  return states.get(module) ?? false;
}

export function canSendMessages(message: Message<true>): boolean {
  if (!isGuildBasedChannel(message.channel)) return false;

  const { me } = message.guild.members;
  if (!me) return false;
  return (
    message.channel
      .permissionsFor(me)
      ?.has(PermissionsBitField.Flags.SendMessages) ?? false
  );
}

const queues = new Map<string, AsyncQueue>();

function queueFor(key: string): AsyncQueue {
  let queue = queues.get(key);
  if (!queue) queues.set(key, (queue = new AsyncQueue()));
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
