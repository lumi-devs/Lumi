import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { getAllRaidLockdowns, scheduleRaidUnlock } from "../data.js";

@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export default class RaidsReadyListener extends Listener<
  typeof Events.ClientReady
> {
  public async run() {
    const lockdowns = await getAllRaidLockdowns();
    for (const lock of lockdowns) {
      scheduleRaidUnlock(lock.guildId, lock.originalLevel, lock.unlocksAt);
    }
  }
}
