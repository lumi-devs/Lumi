import { container, type Container } from "#lib/services.js";
import { Emojis } from "#lib/utilities/assets.js";
import { CoreVersion } from "#lib/utilities/misc.js";
import { fieldsFromSchema, type ConfigField } from "./config-schema.js";
import type { ModuleDefinition, ModuleMeta } from "./meta.js";

export interface ModuleHooks {
  onLoad?: (services: Container) => unknown;
  onUnload?: (services: Container) => unknown;
  reconcileScheduledJobs?: (services: Container) => unknown;
  deleteUserData?: (
    services: Container,
    userId: string,
    requester?: string,
  ) => unknown;
  exportUserData?: (services: Container, userId: string) => unknown;
}

export interface ModuleObject extends ModuleHooks {
  __lumiModule: true;
  name: string;
  dir: string;
  displayName: string;
  emoji: string;
  description: string;
  short?: string;
  endUserDataStatement?: string;
  version: string;
  disableable: boolean;
  conflicts: string[];
  dependencies: string[];
  configFields: ConfigField[];
  configSchema?: ModuleDefinition["configSchema"];
  configOverrides: boolean;
  category?: ModuleDefinition["category"];
  dashboardHref?: string;
  meta: ModuleMeta;
  enabled: boolean;
}

export function defineModule(
  options: ModuleDefinition & ModuleHooks & { name: string },
): Omit<ModuleObject, "dir"> {
  const fields =
    options.configFields ??
    (options.configSchema ? fieldsFromSchema(options.configSchema) : []);

  const meta: ModuleMeta = {
    name: options.name,
    displayName: options.displayName ?? options.name,
    emoji: options.emoji ?? Emojis.Gear,
    description: options.description ?? "",
    short: options.short,
    endUserDataStatement: options.endUserDataStatement,
    version: options.version ?? CoreVersion,
    disableable: options.disableable ?? true,
    conflicts: options.conflicts ?? [],
    dependencies: options.dependencies ?? [],
    configFields: fields,
    configSchema: options.configSchema,
    configOverrides: options.configOverrides ?? true,
    category: options.category,
    dashboardHref: options.dashboardHref,
  };

  const reconcile: (services: Container) => unknown =
    options.reconcileScheduledJobs ?? (() => undefined);

  return {
    __lumiModule: true,
    name: options.name,
    displayName: meta.displayName,
    emoji: meta.emoji,
    description: meta.description,
    short: options.short,
    endUserDataStatement: options.endUserDataStatement,
    version: meta.version,
    disableable: meta.disableable ?? true,
    conflicts: meta.conflicts ?? [],
    dependencies: meta.dependencies ?? [],
    configFields: fields,
    configSchema: options.configSchema,
    configOverrides: meta.configOverrides ?? true,
    category: options.category,
    dashboardHref: options.dashboardHref,
    meta,
    enabled: true,
    onLoad: async (services: Container = container) => {
      await options.onLoad?.(services);
      void Promise.resolve(reconcile(services)).catch((err: unknown) => {
        services.logger.error(
          `[Module:${options.name}] reconcileScheduledJobs failed:`,
          err,
        );
      });
    },
    onUnload: (services: Container = container) =>
      options.onUnload?.(services) ?? undefined,
    reconcileScheduledJobs: reconcile,
    deleteUserData: options.deleteUserData ?? (() => undefined),
    exportUserData: options.exportUserData ?? (() => null),
  };
}

export type ModuleOptions = ModuleDefinition;
