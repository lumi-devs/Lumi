import type { IDatabaseClient } from "../database/types.js";

export interface DatabaseServiceLogger {
  debug?(message: string, ...args: unknown[]): void;
  info?(message: string, ...args: unknown[]): void;
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

export class InfrastructureDatabaseService {
  public constructor(
    private readonly client: IDatabaseClient,
    private readonly logger?: DatabaseServiceLogger,
  ) {}

  public get db(): IDatabaseClient {
    return this.client;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      await this.client.$queryRawUnsafe("SELECT 1");
      return true;
    } catch (err) {
      this.logger?.error?.("[DatabaseService] Health check failed:", err);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.client.$disconnect();
    } catch (err) {
      this.logger?.warn?.("[DatabaseService] Error during disconnect:", err);
    }
  }
}
