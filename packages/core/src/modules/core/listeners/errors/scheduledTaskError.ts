import { Listener } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ScheduledTaskEvents,
  type ScheduledTask,
} from "@sapphire/plugin-scheduled-tasks";

@ApplyOptions<Listener.Options>({
  event: ScheduledTaskEvents.ScheduledTaskError,
})
export class ScheduledTaskErrorListener extends Listener<
  typeof ScheduledTaskEvents.ScheduledTaskError
> {
  public run(error: unknown, task: ScheduledTask, payload: unknown) {
    this.container.logger.fatal(
      `[Task:${task.name}] failed`,
      { payload },
      error,
    );
  }
}
