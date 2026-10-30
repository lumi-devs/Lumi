import { RetentionDays } from "./constants.js";
import { retentionCutoff } from "./ranges.js";

interface RetentionServices {
  db: { prisma: any };
}

export interface RetentionResult {
  snapshots: number;
  messageBuckets: number;
  voiceBuckets: number;
  events: number;
}

export async function purgeOldStats(
  services: RetentionServices,
  now: number = Date.now(),
): Promise<RetentionResult> {
  const cutoff = retentionCutoff(now, RetentionDays);
  const [snapshots, messageBuckets, voiceBuckets, events] = await Promise.all([
    services.db.prisma.statsSnapshot.deleteMany({
      where: { capturedAt: { lt: cutoff } },
    }),
    services.db.prisma.statsMessageBucket.deleteMany({
      where: { bucketStart: { lt: cutoff } },
    }),
    services.db.prisma.statsVoiceBucket.deleteMany({
      where: { bucketStart: { lt: cutoff } },
    }),
    services.db.prisma.statsEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
  ]);

  return {
    snapshots: snapshots.count,
    messageBuckets: messageBuckets.count,
    voiceBuckets: voiceBuckets.count,
    events: events.count,
  };
}
