import { RelayTask } from '@scheduler/Tasks.js';
import { QueuePriority } from '@scheduler/Schedule.js';

export class DataRetentionSweepTask extends RelayTask<'data-retention-sweep'> {
  public constructor() {
    super({
      name: 'data-retention-sweep',
      pattern: '0 3 * * *',
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
