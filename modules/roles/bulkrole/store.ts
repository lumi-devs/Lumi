import type { ModuleServices } from "@lumi/module-kit";
import type { BulkRoleFilter } from "./filter.js";
import type { BulkRoleJobStatus } from "./worker-logic.js";

function prismaOf(services: ModuleServices): any {
  return services.db.prisma;
}

export interface BulkRoleJob {
  readonly id: string;
  readonly guildId: string;
  readonly roleId: string;
  readonly action: string;
  readonly filter: unknown;
  readonly status: BulkRoleJobStatus;
  readonly total: number;
  readonly processed: number;
  readonly failed: number;
  readonly lastError: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateBulkRoleJobInput {
  readonly guildId: string;
  readonly roleId: string;
  readonly action: string;
  readonly filter: BulkRoleFilter;
  readonly total: number;
  readonly createdBy: string;
}

export async function createBulkRoleJob(
  services: ModuleServices,
  input: CreateBulkRoleJobInput,
): Promise<BulkRoleJob> {
  return prismaOf(services).bulkRoleJob.create({
    data: {
      guildId: input.guildId,
      roleId: input.roleId,
      action: input.action,
      filter: input.filter as unknown as object,
      status: "pending",
      total: input.total,
      createdBy: input.createdBy,
    },
  });
}

export async function listRunnableBulkRoleJobs(
  services: ModuleServices,
  limit = 10,
): Promise<BulkRoleJob[]> {
  return prismaOf(services).bulkRoleJob.findMany({
    where: { status: { in: ["pending", "running"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function getBulkRoleJob(
  services: ModuleServices,
  guildId: string,
  jobId: string,
): Promise<BulkRoleJob | null> {
  return prismaOf(services).bulkRoleJob.findFirst({
    where: { id: jobId, guildId },
  });
}

export async function listGuildBulkRoleJobs(
  services: ModuleServices,
  guildId: string,
  limit = 5,
): Promise<BulkRoleJob[]> {
  return prismaOf(services).bulkRoleJob.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function updateBulkRoleJob(
  services: ModuleServices,
  jobId: string,
  data: {
    status?: BulkRoleJobStatus;
    processed?: number;
    failed?: number;
    total?: number;
    lastError?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.status !== undefined) update.status = data.status;
  if (data.processed !== undefined) update.processed = data.processed;
  if (data.failed !== undefined) update.failed = data.failed;
  if (data.total !== undefined) update.total = data.total;
  if (data.lastError !== undefined) update.lastError = data.lastError;
  if (Object.keys(update).length === 0) return;
  await prismaOf(services)
    .bulkRoleJob.update({ where: { id: jobId }, data: update })
    .catch(() => undefined);
}

export async function incrementBulkRoleJob(
  services: ModuleServices,
  jobId: string,
  succeeded: number,
  failed: number,
  data: {
    status?: BulkRoleJobStatus;
    lastError?: string | null;
  } = {},
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (succeeded > 0) update.processed = { increment: succeeded };
  if (failed > 0) update.failed = { increment: failed };
  if (data.status !== undefined) update.status = data.status;
  if (data.lastError !== undefined) update.lastError = data.lastError;
  if (Object.keys(update).length === 0) return;
  await prismaOf(services)
    .bulkRoleJob.update({ where: { id: jobId }, data: update })
    .catch(() => undefined);
}

export async function setBulkRoleJobStatus(
  services: ModuleServices,
  guildId: string,
  jobId: string,
  status: BulkRoleJobStatus,
): Promise<BulkRoleJob | null> {
  const job = await getBulkRoleJob(services, guildId, jobId);
  if (!job) return null;
  await prismaOf(services).bulkRoleJob.update({
    where: { id: job.id },
    data: { status },
  });
  return { ...job, status };
}
