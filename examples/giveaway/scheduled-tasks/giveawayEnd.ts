import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "lumi/scheduling";

export interface GiveawayEndPayload extends CatchUpMeta {
  guildId: string;
  giveawayId: string;
}

// One-shot: RelayTask.run() applies the catch-up policy and republishes the
// fire onto the bus. The actual work (picking winners, editing the message)
// happens in the "giveaway-end" fire handler registered in index.ts's
// onLoad(), on whichever worker consumes the fire.
@ApplyOptions<ScheduledTask.Options>({ name: "giveaway-end" })
export class GiveawayEndTask extends RelayTask<"giveaway-end"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "giveaway-end": GiveawayEndPayload;
  }
}
