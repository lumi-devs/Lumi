// Mock Prisma Client types
export type PrismaClientOptions = {
  log?: Array<'query' | 'info' | 'warn' | 'error'>;
  datasources?: Record<string, { url: string }>;
};

export type PrismaClient = {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  $on: (event: string, callback: (e: any) => void) => void;
  $transaction: <T>(fn: (prisma: any) => Promise<T>) => Promise<T>;
  
  // Models
  guild: any;
  permit: any;
  permitAssignment: any;
  guildModule: any;
  levelingConfig: any;
  levelingUser: any;
  economyConfig: any;
  economyUser: any;
  economyTransaction: any;
  economyInventory: any;
  tempVcConfig: any;
  tempVcChannel: any;
  securityConfig: any;
  verificationPending: any;
  sheet: any;
  installedAddon: any;
  auditLog: any;
  quarantine: any;
};

export const PrismaClient: new (options?: PrismaClientOptions) => PrismaClient = class {
  constructor(_options?: PrismaClientOptions) {}
  async $connect() {}
  async $disconnect() {}
  $on(_event: string, _callback: (e: any) => void) {}
  async $transaction<T>(fn: (prisma: any) => Promise<T>) { return fn(this); }
  
  // Model delegates
  guild = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null, delete: () => null };
  permit = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null, delete: () => null, create: () => null };
  permitAssignment = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null, delete: () => null, create: () => null };
  guildModule = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null, delete: () => null, create: () => null };
  levelingConfig = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  levelingUser = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  economyConfig = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  economyUser = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  economyTransaction = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null, create: () => null };
  economyInventory = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  tempVcConfig = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  tempVcChannel = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  securityConfig = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  verificationPending = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  sheet = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  installedAddon = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  auditLog = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
  quarantine = { findUnique: () => null, findMany: () => [], upsert: () => null, update: () => null };
} as any;

export namespace Prisma {
  export type PromiseLike<T> = Promise<T>;
}