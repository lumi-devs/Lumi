import type { Container } from "#src/lib/Services.js";
import type { Guild, GuildMember, User } from "discord.js";
import { mapWithConcurrency } from "#src/lib/utilities/Concurrency.js";

export const MaxMassTargets = 25;

const MentionOrIdPattern = /<@!?(\d{17,20})>|(\d{17,20})/g;

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

export async function resolveUsers(services: Container, ids: string[]): Promise<User[]> {
  const users: User[] = [];
  await mapWithConcurrency(ids, FetchConcurrency, async (id) => {
    const user = await services.client.users.fetch(id).catch(() => null);
    if (user) users.push(user);
  });
  return users;
}

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
