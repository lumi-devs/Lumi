import type { Container } from "#src/lib/Services.js";
import { QueuePriority, scheduleTask } from "#src/lib/scheduler/Schedule.js";

export interface GdprDeletionResult {

  failedModules: string[];
}

export async function executeGdprDeletion(
  services: Container,
  userId: string,
  requester?: string,
): Promise<GdprDeletionResult> {
  const modules = Array.from(services.moduleStore.values());
  const results = await Promise.allSettled(
    modules.map((m) => m.deleteUserData?.(services, userId, requester)),
  );

  const failedModules: string[] = [];
  for (const [i, res] of results.entries()) {
    if (res.status === "rejected") {
      failedModules.push(modules[i]!.name);
      services.logger.error(
        `[GDPR] Module '${modules[i]!.name}' failed deleteUserData for ${userId}:`,
        res.reason,
      );
    }
  }

  await services.db.deleteUserData(userId);

  return { failedModules };
}

export async function executeGdprExport(
  services: Container,
  userId: string,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  const core = await services.db.exportUserData(userId);
  if (core) result["core"] = core;

  const modules = Array.from(services.moduleStore.values());
  const exports = await Promise.allSettled(
    modules.map((m) => m.exportUserData?.(services, userId)),
  );

  for (const [i, res] of exports.entries()) {
    if (res.status === "fulfilled" && res.value != null) {
      result[modules[i]!.name] = res.value;
    } else if (res.status === "rejected") {
      services.logger.warn(
        `[GDPR] Module '${modules[i]!.name}' failed exportUserData for ${userId}:`,
        res.reason,
      );
    }
  }

  return result;
}

export async function startGdprExportJob(
  services: Container,
  userId: string,
  requestedBy: string,
): Promise<string> {
  const job = await services.db.gdprExportJobs.create({ userId, requestedBy });
  await scheduleTask(
    "gdpr-export",
    { jobId: job.id },
    { customJobOptions: { priority: QueuePriority.UTILITY } },
  );
  return job.id;
}
