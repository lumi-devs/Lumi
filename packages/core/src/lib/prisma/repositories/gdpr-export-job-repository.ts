import type { GdprExportJob } from "@prisma/client";
import { Repository } from "@lumi/lib/prisma/repositories/repository.js";

export interface CreateGdprExportJobInput {
  userId: string;
  requestedBy: string;
}

export interface CompleteGdprExportJobInput {
  filePath: string;
  sizeBytes: number;
  expiresAt: Date;
}

/**
 * `GdprExportJob` rows track the lifecycle of an async GDPR export built by
 * the `gdpr-export` scheduled task (see `@lumi/modules/core/services/gdpr-export-task.js`).
 * No guild scope, like `GlobalBlock` - a user's export spans every guild.
 */
export class GdprExportJobRepository extends Repository {
  public async create(input: CreateGdprExportJobInput): Promise<GdprExportJob> {
    return this.prisma.gdprExportJob.create({
      data: {
        userId: input.userId,
        requestedBy: input.requestedBy,
      },
    });
  }

  public async findById(id: string): Promise<GdprExportJob | null> {
    return this.prisma.gdprExportJob.findUnique({ where: { id } });
  }

  public async markRunning(id: string): Promise<void> {
    await this.prisma.gdprExportJob.update({
      where: { id },
      data: { status: "running" },
    });
  }

  public async markDone(
    id: string,
    input: CompleteGdprExportJobInput,
  ): Promise<void> {
    await this.prisma.gdprExportJob.update({
      where: { id },
      data: {
        status: "done",
        filePath: input.filePath,
        sizeBytes: input.sizeBytes,
        expiresAt: input.expiresAt,
        completedAt: new Date(),
      },
    });
  }

  public async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.gdprExportJob.update({
      where: { id },
      data: {
        status: "failed",
        error: error.slice(0, 1000),
        completedAt: new Date(),
      },
    });
  }

  /** Every row past its `expiresAt` - the cleanup sweep deletes their files, then these rows. */
  public async findExpired(now: Date = new Date()): Promise<GdprExportJob[]> {
    return this.prisma.gdprExportJob.findMany({
      where: { expiresAt: { lt: now } },
    });
  }

  public async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.gdprExportJob.deleteMany({
      where: { id: { in: ids } },
    });
    return count;
  }
}
