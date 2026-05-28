// Role-aware producer wrapper around the BullMQ-owning scheduler. On scheduler /
// monolith the call goes straight to `container.tasks` (BullMQ Queue); on the
// `worker` and `gateway` roles it publishes a `RequestEnvelope` onto the
// scheduler bus, which the scheduler app translates back into a
// `container.tasks.create()` / `.delete()` against the single BullMQ instance.
//
// Callers should never reach for `container.tasks.*` directly — go through
// these so the same source compiles for monolith and split topologies.

import { container } from "@sapphire/framework";
import { getEmberRole, roleOwnsScheduler } from "#lib/env.js";
import {
  publishCreateRequest,
  publishDeleteRequest,
  type CreateRequest,
} from "#lib/scheduler-bus.js";
import type { EmberScheduledTasks } from "#core/types/common.js";

export async function scheduleTask<N extends keyof EmberScheduledTasks>(
  name: N,
  payload: EmberScheduledTasks[N],
  options?: CreateRequest["options"],
): Promise<void> {
  if (roleOwnsScheduler(getEmberRole())) {
    await container.tasks.create(
      { name, payload } as Parameters<typeof container.tasks.create>[0],
      options as Parameters<typeof container.tasks.create>[1],
    );
    return;
  }
  await publishCreateRequest(name, payload, options);
}

export async function cancelTask(jobId: string): Promise<void> {
  if (roleOwnsScheduler(getEmberRole())) {
    await container.tasks.delete(jobId);
    return;
  }
  await publishDeleteRequest(jobId);
}
