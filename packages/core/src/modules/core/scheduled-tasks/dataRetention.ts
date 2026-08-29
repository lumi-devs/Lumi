import { ApplyOptions } from '@sapphire/decorators';
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks';
import { RelayTask } from '#lib/scheduled-tasks.js';

@ApplyOptions<ScheduledTask.Options>({
  name: 'data-retention-sweep',
  pattern: '0 3 * * *',
})
export class DataRetentionSweepTask extends RelayTask<'data-retention-sweep'> {}

declare module '@sapphire/plugin-scheduled-tasks' {
  interface ScheduledTasks {
    'data-retention-sweep': Record<string, never>;
  }
}
