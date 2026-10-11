# Framework: Tasks

One BullMQ queue with priorities, consumed in-process. No separate
scheduler to deploy.

## Repeating tasks

Classes under `tasks/` are discovered from the module directory:

```ts
import { LumiScheduledTask } from "#lib/scheduler/Tasks.js";

export class SweepTask extends LumiScheduledTask {
  public constructor() {
    super({ name: "my-module-sweep", pattern: "*/5 * * * *" });
  }
  public async run(services: Container) {}
}
```

Constructor takes `interval` or `pattern` (+ `timezone`).
`scheduleTask(name, payload, delayOrOptions)` enqueues ad-hoc runs;
typed payloads live in the `ScheduledTasks` map.

## One-shot timers

`api.later(name, delayMs, data)` schedules a persistent delayed fire for
the calling module - it survives restarts, unlike `setTimeout`. Handlers
live in the module's `oneshots` map:

```ts
export const oneshots = {
  recheck: async (services, { guildId, data }) => {},
};
```
