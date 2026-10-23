export {
  createDatabase,
  type DatabaseClient,
  type DatabaseHandle,
  type DatabaseOptions,
} from "./client.ts";
export { DatabaseService, type DatabaseServiceOptions } from "./service.ts";
export type { DatabaseCaches, RepositoryDeps } from "./repositories/base.ts";
export type { ModuleConfigMap } from "./repositories/config.ts";
export type {
  AfkEntry,
  CaseAction,
  DownloaderModule,
  DownloaderRepo,
  Guild,
  GuildModuleConfig,
  ModerationCase,
  ModNote,
  ModuleData,
  Permit,
  PermitAssignment,
  Prisma,
} from "../generated/client/index.js";
export {
  ModerationRepository,
  type CreateCaseInput,
  type ListCasesOptions,
} from "./repositories/moderation.ts";
export {
  PermitRepository,
  type PermitKind,
  type PermitPolarity,
  type PermitTargetType,
  type PermitWithAssignments,
  type TargetPermitPayload,
} from "./repositories/permits.ts";
