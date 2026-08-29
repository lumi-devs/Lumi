import { Piece } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import { Emojis } from "#lib/utilities/assets.js";
import { CoreVersion } from "#utilities/misc.js";

import {
  fieldsFromSchema,
  type ConfigField,
  type ModuleConfigSchema,
} from "./config-schema.js";

export {
  FieldType,
  type ConfigField,
  type ModuleConfigSchema,
  cfg,
  parseConfigList,
} from "./config-schema.js";

/** Used during module discovery without executing the module's code. */
export interface ModuleMeta {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  disableable?: boolean;
  conflicts?: string[];
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: ModuleConfigSchema;
  configOverrides?: boolean;
  /** Dashboard sidebar/grid grouping (e.g. "Moderation", "Security"). Falls back to "System" when absent. */
  category?: string;
  /** Dashboard route (relative to `/guild/:id/`) for a bespoke settings page, instead of the generic `/modules/[name]` form. */
  dashboardHref?: string;
  onLoad?: () => void;
  onUnload?: () => void;
}

/**
 * Configuration options provided to the `@DefineModule` decorator or the `Module` constructor.
 */
export interface ModuleOptions extends Piece.Options {
  name?: string;
  displayName?: string;
  emoji?: string;
  description?: string;
  version?: string;
  conflicts?: string[];
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: ModuleConfigSchema;
  configOverrides?: boolean;
  disableable?: boolean;
  /** Dashboard sidebar/grid grouping (e.g. "Moderation", "Security"). Falls back to "System" when absent. */
  category?: string;
  /** Dashboard route (relative to `/guild/:id/`) for a bespoke settings page, instead of the generic `/modules/[name]` form. */
  dashboardHref?: string;
}

/**
 * A class decorator to attach metadata to a {@link Module} piece.
 * Automatically parses configuration schemas into runtime config fields.
 */
export function DefineModule(options: ModuleOptions) {
  return function <T extends abstract new (...args: any[]) => Module>(
    target: T,
  ) {
    const fields =
      options.configFields ??
      (options.configSchema ? fieldsFromSchema(options.configSchema) : []);

    const meta: ModuleMeta = {
      name: options.name ?? target.name.toLowerCase().replace(/module$/, ""),
      displayName: options.displayName ?? options.name ?? target.name,
      emoji: options.emoji ?? Emojis.GEAR,
      description: options.description ?? "",
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

    (target as any).meta = meta;
    return target;
  };
}

/**
 * Abstract base class for all Lumi feature modules.
 * Inherits from Sapphire's `Piece` to allow registration within Sapphire stores.
 */
export abstract class Module extends Piece {
  public readonly displayName: string;
  public readonly emoji: string;
  public readonly description: string;
  public readonly version: string;
  public readonly conflicts: string[];
  public readonly dependencies: string[];
  public readonly configFields: ConfigField[];

  public override enabled = true;

  /**
   * Constructs a new Module instance.
   *
   * @param context - The loader context provided by Sapphire.
   * @param options - Additional options to configure the module.
   */
  public constructor(
    context: Piece.LoaderContext,
    options: ModuleOptions = {},
  ) {
    super(context, options);
    this.displayName = options.displayName ?? this.name;
    this.emoji = options.emoji ?? Emojis.GEAR;
    this.description = options.description ?? "";
    this.version = options.version ?? CoreVersion;
    this.conflicts = options.conflicts ?? [];
    this.dependencies = options.dependencies ?? [];
    this.configFields =
      options.configFields ??
      (this.constructor as any).meta?.configFields ??
      (options.configSchema ? fieldsFromSchema(options.configSchema) : []);
  }

  /**
   * Hook called when a user requests their data to be deleted under GDPR/CCPA.
   * Modules that store user-specific data must override this method to scrub records.
   *
   * @param _userId - The ID of the user requesting deletion.
   * @param _requester - The entity requesting the deletion (user or staff).
   */
  public deleteUserData(
    _userId: string,
    _requester?: string,
  ): Awaitable<void> {
    return undefined;
  }

  /**
   * Hook called when a user requests an export of their data under GDPR/CCPA.
   * Modules that store user-specific data must override this method and
   * return it in a plain, JSON-serializable shape. Returning `null` (the
   * default) omits this module from the combined export.
   *
   * @param _userId - The ID of the user requesting export.
   */
  public exportUserData(
    _userId: string,
  ): Awaitable<Record<string, unknown> | null> {
    return null;
  }

  /**
   * Re-arms any delayed jobs or background tasks this module owns after a restart.
   */
  public reconcileScheduledJobs(): Awaitable<void> {
    return undefined;
  }

  public override onLoad(): Awaitable<unknown> {
    void Promise.resolve(this.reconcileScheduledJobs()).catch(
      (err: unknown) => {
        this.container.logger.error(
          `[Module:${this.name}] reconcileScheduledJobs failed:`,
          err,
        );
      },
    );
    return super.onLoad();
  }

  public override onUnload(): Awaitable<unknown> {
    return super.onUnload();
  }
}
