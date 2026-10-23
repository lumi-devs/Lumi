import { userMention, type GuildMember, type User } from "discord.js";
import type { CommandContext } from "@lumi/module-kit";
import { makeErrorCard, type CardReply } from "@lumi/ui";

interface BaseTarget {
  readonly user: User;
  readonly botMember: GuildMember;
}

export interface MemberTarget extends BaseTarget {
  readonly member: GuildMember;
}

export interface UserTarget extends BaseTarget {
  readonly member: GuildMember | null;
}

export type MemberTargetResult =
  | { readonly target: MemberTarget; readonly error?: undefined }
  | { readonly target?: undefined; readonly error: CardReply };

export type UserTargetResult =
  | { readonly target: UserTarget; readonly error?: undefined }
  | { readonly target?: undefined; readonly error: CardReply };

/** For actions that require the user to currently be in the guild. */
export async function resolveMemberTarget(ctx: CommandContext): Promise<MemberTargetResult> {
  const resolved = await resolve(ctx);
  if (resolved.error) return resolved;
  const { target } = resolved;
  if (!target.member) {
    return {
      error: makeErrorCard("Not Found", `${userMention(target.user.id)} is not a member of this server.`),
    };
  }
  return { target: { ...target, member: target.member } };
}

/** For bans and softbans, which also apply to users outside the guild. */
export async function resolveUserTarget(ctx: CommandContext): Promise<UserTargetResult> {
  return resolve(ctx);
}

type InternalResult =
  | { readonly target: UserTarget; readonly error?: undefined }
  | { readonly target?: undefined; readonly error: CardReply };

async function resolve(ctx: CommandContext): Promise<InternalResult> {
  const guild = ctx.guild;
  if (!guild) {
    return { error: makeErrorCard("Server Only", "This command can only be used in a server.") };
  }

  const user = await ctx.getUser("user");
  if (!user) {
    return { error: makeErrorCard("Missing User", "Please specify a valid user.") };
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  const botMember = guild.members.me;
  if (!botMember) {
    return { error: makeErrorCard("Unavailable", "I could not resolve my own server member. Try again.") };
  }

  if (member && ctx.member) {
    const hierarchyError = checkHierarchy(ctx.member, member, botMember);
    if (hierarchyError) {
      return { error: makeErrorCard("Permission Denied", hierarchyError) };
    }
  }

  return { target: { user, member, botMember } };
}

export function checkHierarchy(
  moderator: GuildMember,
  target: GuildMember,
  botMember: GuildMember | null,
): string | null {
  if (target.id === moderator.id) {
    return "You cannot moderate yourself.";
  }

  if (target.id === target.guild.ownerId) {
    return "You cannot moderate the server owner.";
  }

  if (botMember && target.id === botMember.id) {
    return "You cannot moderate me.";
  }

  if (moderator.id !== target.guild.ownerId) {
    if (moderator.roles.highest.position <= target.roles.highest.position) {
      return "You cannot moderate this user because their highest role is equal to or higher than yours.";
    }
  }

  if (botMember && botMember.roles.highest.position <= target.roles.highest.position) {
    return "I cannot moderate this user because their highest role is equal to or higher than mine.";
  }

  return null;
}
