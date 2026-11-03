import type { Redis } from "ioredis";

const RecentKey = "lumi:errors:recent";
const RecordKeyPrefix = "lumi:errors:record:";
const MaxRecent = 200;
const RecordTtlSeconds = 7 * 24 * 60 * 60;

export interface ErrorRecord {
  id: string;
  at: string;
  source: string;
  message: string;
  stack?: string;
  guildId?: string;
  userId?: string;
  command?: string;
}

export type ErrorInput = Omit<
  ErrorRecord,
  "id" | "at" | "message" | "stack"
> & {
  error: unknown;
};

export interface ErrorStore {
  record(input: ErrorInput): Promise<ErrorRecord>;
  recent(limit?: number): Promise<ErrorRecord[]>;
  get(id: string): Promise<ErrorRecord | null>;
}

export function createErrorStore(redis: Redis): ErrorStore {
  return {
    async record(input): Promise<ErrorRecord> {
      const error = input.error;
      const record: ErrorRecord = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        source: input.source,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        guildId: input.guildId,
        userId: input.userId,
        command: input.command,
      };
      const payload = JSON.stringify(record);
      await redis
        .multi()
        .set(`${RecordKeyPrefix}${record.id}`, payload, "EX", RecordTtlSeconds)
        .lpush(RecentKey, record.id)
        .ltrim(RecentKey, 0, MaxRecent - 1)
        .exec();
      return record;
    },

    async recent(limit = 10): Promise<ErrorRecord[]> {
      const ids = await redis.lrange(RecentKey, 0, Math.max(0, limit - 1));
      if (ids.length === 0) return [];
      const payloads = await redis.mget(
        ...ids.map((id) => `${RecordKeyPrefix}${id}`),
      );
      return payloads.flatMap((payload) => {
        if (!payload) return [];
        try {
          return [JSON.parse(payload) as ErrorRecord];
        } catch {
          return [];
        }
      });
    },

    async get(id): Promise<ErrorRecord | null> {
      const payload = await redis.get(`${RecordKeyPrefix}${id}`);
      if (!payload) return null;
      try {
        return JSON.parse(payload) as ErrorRecord;
      } catch {
        return null;
      }
    },
  };
}
