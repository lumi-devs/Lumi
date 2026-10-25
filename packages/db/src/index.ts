// Mock Prisma Client for environments where Prisma generate fails
import { PrismaClient as MockPrismaClient } from "./generated/client.js";

export const prisma = new MockPrismaClient();

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export type PrismaClient = MockPrismaClient;