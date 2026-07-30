import {
  AllFlowsPrecondition,
  container,
  type Command,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  GuildMemberRoleManager,
  Message,
} from "discord.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";

function chatInputCommandPath(i: ChatInputCommandInteraction): string {
  const parts = [i.commandName];
  const group = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand(false);
  if (group) parts.push(group);
  if (sub) parts.push(sub);
  return parts.join(":");
}

function memberRoleIds(
  member: { roles: string[] | GuildMemberRoleManager } | null | undefined,
): Set<string> {
  const roles = member?.roles;
  if (Array.isArray(roles)) return new Set(roles);
  return new Set(roles?.cache.keys() ?? []);
}

@ApplyOptions<AllFlowsPrecondition.Options>({ position: 22 })
export class PermissionOverridesPrecondition extends AllFlowsPrecondition {
  public override async chatInputRun(i: ChatInputCommandInteraction) {
    if (!i.guild) return this.ok();
    const uid = i.user.id;
    if (PermitResolver.isBotOwner(uid)) return this.ok();
    if (i.guild.ownerId === uid) return this.ok();
    return this.#check(i.guild.id, chatInputCommandPath(i), {
      userId: uid,
      channelId: i.channelId,
      roleIds: memberRoleIds(i.member),
      guildOwnerId: i.guild.ownerId,
    });
  }

  public override async messageRun(m: Message, command: Command) {
    if (!m.guild) return this.ok();
    const uid = m.author.id;
    if (PermitResolver.isBotOwner(uid)) return this.ok();
    if (m.guild.ownerId === uid) return this.ok();
    return this.#check(m.guild.id, command.name, {
      userId: uid,
      channelId: m.channelId,
      roleIds: memberRoleIds(m.member),
      guildOwnerId: m.guild.ownerId,
    });
  }

  public override async contextMenuRun(i: ContextMenuCommandInteraction) {
    if (!i.guild) return this.ok();
    const uid = i.user.id;
    if (PermitResolver.isBotOwner(uid)) return this.ok();
    if (i.guild.ownerId === uid) return this.ok();
    return this.#check(i.guild.id, i.commandName, {
      userId: uid,
      channelId: i.channelId,
      roleIds: memberRoleIds(i.member),
      guildOwnerId: i.guild.ownerId,
    });
  }

  async #check(
    guildId: string,
    path: string,
    ctx: {
      userId: string;
      channelId: string;
      roleIds: Set<string>;
      guildOwnerId: string;
    },
  ) {
    const hasPermit = await container.permitResolver.hasPermit({
      guildId,
      userId: ctx.userId,
      roleIds: Array.from(ctx.roleIds),
      permitNode: path,
      guildOwnerId: ctx.guildOwnerId,
    });

    if (hasPermit) return this.ok();
    return this.error({
      identifier: "PermissionDenied",
      message: "You do not have permission to use this command.",
    });
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    PermissionOverrides: never;
  }
}
