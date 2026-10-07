import { RelayTask } from '#lib/scheduled-tasks.js';
import { QueuePriority } from '#lib/schedule-task.js';

export class DataRetentionSweepTask extends RelayTask<'data-retention-sweep'> {
  public constructor() {
    super({
      name: 'data-retention-sweep',
      pattern: '0 3 * * *',
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    'data-retention-sweep': Record<string, never>;
  }
}
