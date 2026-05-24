import { Listener, Events, container } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember } from "discord.js";
import { checkRaidJoin, readRaidConfig } from "../index.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export default class GuildMemberAddListener extends Listener<
  typeof Events.GuildMemberAdd
> {
  public async run(member: GuildMember) {
    const { guild } = member;

    if (!(await this.container.db.isModuleEnabled(guild.id, "raids"))) return;

    container.logger.debug(
      `[Raids] ${EmberEmojis.RAID} Checking member join for ${member.user.tag} in ${guild.name} (${guild.id})`,
    );

    const config = await readRaidConfig(guild.id);
    const triggered = await checkRaidJoin(guild, config);
    if (triggered) {
      container.logger.warn(
        `[Raids] ${EmberEmojis.LOCKDOWN} LOCKDOWN TRIGGERED in ${guild.name} (${guild.id})`,
      );
    }
  }
}
