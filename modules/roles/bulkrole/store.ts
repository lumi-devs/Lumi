import type { ModuleServices } from "@lumi/module-kit";
import type { BulkRoleFilter } from "./filter.js";
import type { BulkRoleJobStatus } from "./worker-logic.js";

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
  return (await services.helpers.roles.bulkRole.create({
    guildId: input.guildId,
    roleId: input.roleId,
    action: input.action,
    filter: input.filter,
    total: input.total,
    createdBy: input.createdBy,
  })) as unknown as BulkRoleJob;
}

export async function listRunnableBulkRoleJobs(
  services: ModuleServices,
  limit = 10,
): Promise<BulkRoleJob[]> {
  return (await services.helpers.roles.bulkRole.listRunnable(
    limit,
  )) as unknown as BulkRoleJob[];
}

export async function getBulkRoleJob(
  services: ModuleServices,
  guildId: string,
  jobId: string,
): Promise<BulkRoleJob | null> {
  return (await services.helpers.roles.bulkRole.find(
    guildId,
    jobId,
  )) as unknown as BulkRoleJob | null;
}

export async function listGuildBulkRoleJobs(
  services: ModuleServices,
  guildId: string,
  limit = 5,
): Promise<BulkRoleJob[]> {
  return (await services.helpers.roles.bulkRole.listGuild(
    guildId,
    limit,
  )) as unknown as BulkRoleJob[];
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
  await services.helpers.roles.bulkRole.update(jobId, data);
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
  await services.helpers.roles.bulkRole.increment(
    jobId,
    succeeded,
    failed,
    data,
  );
}

export async function setBulkRoleJobStatus(
  services: ModuleServices,
  guildId: string,
  jobId: string,
  status: BulkRoleJobStatus,
): Promise<BulkRoleJob | null> {
  const job = await getBulkRoleJob(services, guildId, jobId);
  if (!job) return null;
  await services.helpers.roles.bulkRole.updateStatus(job.id, status);
  return { ...job, status };
}
