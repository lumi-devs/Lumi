import type { PrismaClient } from "@prisma/client";
import type { CacheFacade } from "./cache.js";

export interface DbContext {
  readonly prisma: PrismaClient;
  readonly cache: CacheFacade;
}
