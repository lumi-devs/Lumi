import { Piece } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import type { RequesterType } from "#lib/gdpr.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Emojis } from "#lib/utilities/assets.js";

import { fieldsFromSchema, type ConfigField } from "./config-schema.js";

export {
  FieldType,
  type ConfigField,
  cfg,
  parseConfigList,
} from "./config-schema.js";

/**
 * Represents the static metadata structure exported by a feature module's index file.
 * This metadata is used during module discovery without executing the module's code.
 */
export interface ModuleMeta {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  isCore?: boolean;
  conflicts?: string[];
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: any; // Replaced z.ZodObject<z.ZodRawShape> with any to avoid tight coupling or use BaseValidator<any>
  configOverrides?: boolean;
  onLoad?: () => void;
  onUnload?: () => void;
}

/**
 * Configuration options provided to the `@DefineModule` decorator or the `Module` constructor.
 */
export interface ModuleOptions extends Piece.Options {
  displayName?: string;
  emoji?: string;
  description?: string;
  version?: string;
  conflicts?: string[];
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: any;
  configOverrides?: boolean;
  isCore?: boolean;
}

/**
 * A class decorator to attach metadata to a {@link Module} piece.
 * Automatically parses configuration schemas into runtime config fields.
 *
 * @param options - The metadata options for the module.
 * @returns A decorated class constructor.
 */
export function DefineModule(options: ModuleOptions) {
  if (options.configSchema) {
    options.configFields = fieldsFromSchema(options.configSchema);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- abstract class constructor signature requires any[] params
  return <T extends abstract new (...args: any[]) => any>(ctor: T): T => {
    const proxied = ApplyOptions<ModuleOptions>(options)(
      ctor as unknown as new (...args: never[]) => Module,
    ) as unknown as T;
    (proxied as unknown as { meta: ModuleOptions }).meta = options;
    return proxied;
  };
}

/**
 * The base class that all feature modules must extend.
 * Modules act as organizational units for commands, listeners, and services,
 * providing a centralized lifecycle and configuration interface.
 */
export abstract class Module extends Piece {
  public readonly displayName: string;
  public readonly emoji: string;
  public readonly description: string;
  public readonly version: string;
  public readonly conflicts: string[];
  public readonly dependencies: string[];
  public readonly configFields: ConfigField[];
  public readonly isCore: boolean;

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
    this.version = options.version ?? "0.0.0";
    this.isCore = options.isCore ?? false;
    this.conflicts = options.conflicts ?? [];
    this.dependencies = options.dependencies ?? [];
    this.configFields =
      options.configFields ??
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
    _requester: RequesterType,
  ): Awaitable<void> {
    return undefined;
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
}
