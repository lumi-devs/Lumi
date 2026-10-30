import type {
  Guild,
  GuildBasedChannel,
  GuildMember,
  Message,
  Role,
  User,
} from "discord.js";
import type { TriggerSnapshot } from "./types.js";

export interface ContextInput {
  guild: Guild;
  actor: User;
  member: GuildMember | null;
  channel: GuildBasedChannel | null;
  message?: Message | null;
  args: string[];
  trigger: TriggerSnapshot;
  modalFields?: Record<string, string>;
  selectValues?: string[];
  now?: Date;
}

function userValues(user: User): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    globalName: user.globalName ?? user.username,
    displayName: user.displayName,
    tag: user.tag,
    bot: user.bot,
    mention: `<@${user.id}>`,
    avatarUrl: user.displayAvatarURL({ size: 256 }),
    createdAt: user.createdAt.toISOString(),
  };
}

function roleValues(role: Role): Record<string, unknown> {
  return {
    id: role.id,
    name: role.name,
    mention: `<@&${role.id}>`,
    color: role.hexColor,
    position: role.position,
    hoist: role.hoist,
    managed: role.managed,
  };
}

function memberValues(member: GuildMember): Record<string, unknown> {
  const roles = member.roles?.cache
    ? [...member.roles.cache.values()]
    : [];
  const highest = member.roles?.highest ?? null;
  return {
    id: member.id,
    displayName: member.displayName,
    nickname: member.nickname ?? member.displayName,
    mention: `<@${member.id}>`,
    avatarUrl: member.displayAvatarURL({ size: 256 }),
    joinedAt: member.joinedAt?.toISOString() ?? "",
    createdAt: member.user.createdAt.toISOString(),
    roleIds: roles.map((role) => role.id),
    roles: roles.map((role) => role.name),
    highestRole: highest ? roleValues(highest) : null,
    bot: member.user.bot,
  };
}

function channelValues(channel: GuildBasedChannel | null): Record<string, unknown> {
  if (!channel) return {};
  const value = channel as unknown as {
    id: string;
    name?: string;
    type?: number;
    topic?: string | null;
    parentId?: string | null;
  };
  return {
    id: value.id,
    name: value.name ?? "",
    mention: `<#${value.id}>`,
    type: value.type ?? 0,
    topic: value.topic ?? "",
    parentId: value.parentId ?? "",
  };
}

export function buildContextValues(input: ContextInput): Record<string, unknown> {
  const now = input.now ?? new Date();
  const member = input.member;
  const mentionedRole = input.message?.mentions.roles.first() ?? null;
  const highestRole = member?.roles?.highest ?? null;
  const role = mentionedRole ?? highestRole;
  const target = input.message?.mentions.users.first() ?? input.actor;

  const args = [...input.args] as string[] & { raw: string };
  args.raw = input.args.join(" ");

  return {
    user: userValues(input.actor),
    member: member ? memberValues(member) : {},
    channel: channelValues(input.channel),
    guild: {
      id: input.guild.id,
      name: input.guild.name,
      iconUrl: input.guild.iconURL({ size: 256 }) ?? "",
      memberCount: input.guild.memberCount,
      ownerId: input.guild.ownerId,
      createdAt: input.guild.createdAt.toISOString(),
    },
    role: role ? roleValues(role) : {},
    target: userValues(target),
    args,
    argsText: input.args.join(" "),
    trigger: {
      type: input.trigger.type,
      value: input.trigger.value,
    },
    modal: input.modalFields ?? {},
    select: {
      values: input.selectValues ?? [],
      value: input.selectValues?.[0] ?? "",
      count: input.selectValues?.length ?? 0,
    },
    message: input.message
      ? {
          id: input.message.id,
          content: input.message.content,
          url: input.message.url,
          authorId: input.message.author.id,
          channelId: input.message.channelId,
        }
      : {},
    now: {
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1_000),
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 19),
    },
  };
}
