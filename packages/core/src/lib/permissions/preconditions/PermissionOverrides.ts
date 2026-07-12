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
import {
  PermissionLevel,
  resolvePermissionLevel,
} from "#lib/permissions/index.js";

function chatInputCommandPath(i: ChatInputCommandInteraction): string {
  const parts = [i.commandName];
  const group = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand(false);
  if (group) parts.push(group);
  if (sub) parts.push(sub);
  return parts.join(":");
}

/**
 * Collect a member's role IDs across both shapes: the REST/API form (`roles` is
 * a `string[]`) and the gateway form (`roles` is a `GuildMemberRoleManager`).
 */
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
    const level = await resolvePermissionLevel(i);
    if (level >= PermissionLevel.BOT_OWNER) return this.ok();
    if (!i.guild || i.guild.ownerId === i.user.id) return this.ok();
    return this.#check(i.guild.id, chatInputCommandPath(i), {
      userId: i.user.id,
      channelId: i.channelId,
      roleIds: memberRoleIds(i.member),
      guild: i.guild,
    });
  }

  public override async messageRun(m: Message, command: Command) {
    if (!m.guild) return this.ok();
    const level = await resolvePermissionLevel(m);
    if (level >= PermissionLevel.BOT_OWNER || m.guild.ownerId === m.author.id)
      return this.ok();
    return this.#check(m.guild.id, command.name, {
      userId: m.author.id,
      channelId: m.channelId,
      roleIds: memberRoleIds(m.member),
      guild: m.guild,
    });
  }

  public override async contextMenuRun(i: ContextMenuCommandInteraction) {
    if (!i.guild) return this.ok();
    const level = await resolvePermissionLevel(i);
    if (level >= PermissionLevel.BOT_OWNER || i.guild.ownerId === i.user.id)
      return this.ok();
    return this.#check(i.guild.id, i.commandName, {
      userId: i.user.id,
      channelId: i.channelId,
      roleIds: memberRoleIds(i.member),
      guild: i.guild,
    });
  }

  async #check(
    guildId: string,
    path: string,
    ctx: {
      userId: string;
      channelId: string;
      roleIds: Set<string>;
      guild: import("discord.js").Guild | null;
    },
  ) {
    const overrides = await container.db.permissions.getPermissionOverrides(
      guildId,
      path,
    );
    if (!overrides.length) return this.ok();

    const { userId, channelId, roleIds, guild } = ctx;

    const user = overrides.find(
      (o: any) => o.modelType === "user" && o.modelId === userId,
    );
    if (user)
      return user.allow
        ? this.ok()
        : this.error({
            identifier: "AccessDenied",
            message: "You are not permitted to use this command.",
          });

    const chan = overrides.find(
      (o: any) => o.modelType === "channel" && o.modelId === channelId,
    );
    if (chan)
      return chan.allow
        ? this.ok()
        : this.error({
            identifier: "AccessDenied",
            message: "This command is not permitted in this channel.",
          });

    if (channelId) {
      if (!guild) return this.error({ message: "Guild not found." });
      const channel = guild.channels.cache.get(channelId);
      const catId = channel?.parentId;
      if (catId) {
        const cat = overrides.find(
          (o: any) => o.modelType === "category" && o.modelId === catId,
        );
        if (cat)
          return cat.allow
            ? this.ok()
            : this.error({
                identifier: "AccessDenied",
                message: "This command is not permitted in this category.",
              });
      }
    }

    const roles = Array.from(roleIds)
      .map((id) => ({ id, pos: guild?.roles.cache.get(id)?.position }))
      .filter((r): r is { id: string; pos: number } => r.pos !== undefined)
      .sort((a, b) => b.pos - a.pos);

    for (const { id } of roles) {
      const m = overrides.find(
        (o: any) => o.modelType === "role" && o.modelId === id,
      );
      if (m)
        return m.allow
          ? this.ok()
          : this.error({
              identifier: "AccessDenied",
              message: "You are not permitted to use this command.",
            });
    }

    const every = overrides.find((o: any) => o.modelType === "everyone");
    if (every)
      return every.allow
        ? this.ok()
        : this.error({
            identifier: "AccessDenied",
            message: "This command has been disabled.",
          });

    return this.ok();
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    PermissionOverrides: never;
  }
}
