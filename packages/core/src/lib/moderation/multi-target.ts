import { container } from "@sapphire/framework";
import type { Guild, GuildMember, User } from "discord.js";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";

/** Hard cap on how many targets a single mass-action slash invocation may resolve. */
export const MaxMassTargets = 25;

const MentionOrIdPattern = /<@!?(\d{17,20})>|(\d{17,20})/g;

/**
 * Extracts up to {@linkcode MaxMassTargets} unique snowflakes from a
 * space/comma-separated string of mentions and/or raw IDs - the slash-command
 * equivalent of the prefix path's repeated positional arguments.
 */
export function parseSnowflakeList(raw: string): string[] {
  const ids = new Set<string>();
  for (const match of raw.matchAll(MentionOrIdPattern)) {
    const id = match[1] ?? match[2];
    if (!id) continue;
    ids.add(id);
    if (ids.size >= MaxMassTargets) break;
  }
  return [...ids];
}

const FetchConcurrency = 5;

/** Resolves a batch of user IDs in parallel, silently dropping any that don't resolve. */
export async function resolveUsers(ids: string[]): Promise<User[]> {
  const users: User[] = [];
  await mapWithConcurrency(ids, FetchConcurrency, async (id) => {
    const user = await container.client.users.fetch(id).catch(() => null);
    if (user) users.push(user);
  });
  return users;
}

/** Resolves a batch of member IDs in parallel, silently dropping any that aren't in the guild. */
export async function resolveMembers(
  guild: Guild,
  ids: string[],
): Promise<GuildMember[]> {
  const members: GuildMember[] = [];
  await mapWithConcurrency(ids, FetchConcurrency, async (id) => {
    const member =
      guild.members.cache.get(id) ??
      (await guild.members.fetch(id).catch(() => null));
    if (member) members.push(member);
  });
  return members;
}
