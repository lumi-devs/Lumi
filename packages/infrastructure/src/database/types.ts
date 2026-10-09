import type { PrismaClient } from "@prisma/client";

export type IDatabaseClient = PrismaClient;

export interface DatabaseConnectionConfig {
  url?: string;
  replicaUrl?: string;
  poolSize?: number;
  appName?: string;
}

export type QueryMetricsCallback = (
  model: string | undefined,
  operation: string,
  durationMs: number,
) => void;

export interface IRepository<T = unknown> {
  findById?(id: string): Promise<T | null>;
  findMany?(filter?: Record<string, unknown>): Promise<T[]>;
  create?(data: unknown): Promise<T>;
  update?(id: string, data: unknown): Promise<T>;
  delete?(id: string): Promise<boolean>;
}

export interface DatabaseTransactionContext {
  prisma: IDatabaseClient;
  now: number;
}
