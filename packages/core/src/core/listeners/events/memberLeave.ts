import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember, PartialGuildMember } from "discord.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberRemove })
export class MemberLeaveEventBusListener extends Listener<
  typeof Events.GuildMemberRemove
> {
  public override run(member: GuildMember | PartialGuildMember) {
    if (!this.container.rabbit) return;
    void this.container.rabbit.publishEvent("MEMBER_LEAVE", {
      guildId: member.guild.id,
      userId: member.user?.id ?? member.id,
      username: member.user?.username ?? null,
      leftAt: Date.now(),
    });
  }
}
