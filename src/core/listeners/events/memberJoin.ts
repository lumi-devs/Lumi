import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember } from "discord.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class MemberJoinEventBusListener extends Listener<
  typeof Events.GuildMemberAdd
> {
  public override run(member: GuildMember) {
    this.container.logger.debug(
      `[EventBus] ${EmberEmojis.BELL} MEMBER_JOIN: ${member.user.tag} → ${member.guild.name} (${member.guild.id})`,
    );
    if (!this.container.rabbit) return;
    void this.container.rabbit.publishEvent("MEMBER_JOIN", {
      guildId: member.guild.id,
      userId: member.user.id,
      username: member.user.username,
      joinedAt: member.joinedTimestamp ?? Date.now(),
    });
  }
}
