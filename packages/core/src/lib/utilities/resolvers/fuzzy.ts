import { Result, UserError } from "@sapphire/framework";
import type { Guild, GuildMember, Role, GuildBasedChannel } from "discord.js";

/**
 * Fuzzy search for a member in a guild by name, nickname, or mention.
 */
export async function resolveFuzzyMember(
  parameter: string,
  guild: Guild,
): Promise<Result<GuildMember, UserError>> {
  const lowercaseParameter = parameter.toLowerCase();

  const precise = await guild.members
    .fetch(parameter.replace(/[<@!>]/g, ""))
    .catch(() => null);
  if (precise) return Result.ok(precise);

  const members = await guild.members.search({ query: parameter, limit: 15 });
  const match =
    members.find(
      (m) =>
        m.displayName.toLowerCase().includes(lowercaseParameter) ||
        m.user.username.toLowerCase().includes(lowercaseParameter),
    ) ?? members.first();

  if (match) return Result.ok(match);

  return Result.err(
    new UserError({
      identifier: "MemberNotFound",
      message: `I couldn't find any member matching \`${parameter}\`.`,
    }),
  );
}

/**
 * Fuzzy search for a role in a guild.
 */
export function resolveFuzzyRole(
  parameter: string,
  guild: Guild,
): Result<Role, UserError> {
  const lowercaseParameter = parameter.toLowerCase();

  const precise = guild.roles.cache.get(parameter.replace(/[<@&>]/g, ""));
  if (precise) return Result.ok(precise);

  const match = guild.roles.cache.find((r) =>
    r.name.toLowerCase().includes(lowercaseParameter),
  );
  if (match) return Result.ok(match);

  return Result.err(
    new UserError({
      identifier: "RoleNotFound",
      message: `I couldn't find any role matching \`${parameter}\`.`,
    }),
  );
}

/**
 * Fuzzy search for a channel in a guild.
 */
export function resolveFuzzyChannel(
  parameter: string,
  guild: Guild,
): Result<GuildBasedChannel, UserError> {
  const lowercaseParameter = parameter.toLowerCase();

  const precise = guild.channels.cache.get(parameter.replace(/[<@#>]/g, ""));
  if (precise) return Result.ok(precise);

  const match = guild.channels.cache.find((c) =>
    c.name.toLowerCase().includes(lowercaseParameter),
  );
  if (match) return Result.ok(match);

  return Result.err(
    new UserError({
      identifier: "ChannelNotFound",
      message: `I couldn't find any channel matching \`${parameter}\`.`,
    }),
  );
}
