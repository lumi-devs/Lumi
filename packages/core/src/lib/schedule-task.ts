import { container } from "@sapphire/framework";
import { getServiceRole, roleOwnsScheduler } from "#lib/env.js";
import {
  publishCreateRequest,
  publishDeleteRequest,
  type CreateRequest,
} from "#lib/scheduler-bus.js";
import type { ScheduledTasks } from "#lib/types/common.js";

export async function scheduleTask<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
  options?: CreateRequest["options"],
): Promise<void> {
  if (roleOwnsScheduler(getServiceRole())) {
    await container.tasks.create(
      { name, payload },
      options as Parameters<typeof container.tasks.create>[1],
    );
    return;
  }
  await publishCreateRequest(name, payload, options);
}

export async function cancelTask(jobId: string): Promise<void> {
  if (roleOwnsScheduler(getServiceRole())) {
    await container.tasks.delete(jobId);
    return;
  }
  await publishDeleteRequest(jobId);
}
