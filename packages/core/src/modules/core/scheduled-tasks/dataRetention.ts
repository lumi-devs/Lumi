import { RelayTask } from '#lib/scheduler/tasks.js';
import { QueuePriority } from '#lib/scheduler/schedule.js';

export class DataRetentionSweepTask extends RelayTask<'data-retention-sweep'> {
  public constructor() {
    super({
      name: 'data-retention-sweep',
      pattern: '0 3 * * *',
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
