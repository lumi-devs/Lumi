import { Piece, type Container } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import type { RequesterType } from "../lib/gdpr.js";
import { ApplyOptions } from "@sapphire/decorators";
import { EmberEmojis } from "#utilities/assets.js";

// ─────────────────────────────────────────────────────────────────────────────

export enum FieldType {
  BOOLEAN = "BOOLEAN",
  NUMBER = "NUMBER",
  STRING = "STRING",
  ENUM = "ENUM",
  CHANNEL = "CHANNEL",
  ROLE = "ROLE",
  USER = "USER",
}

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  description: string;
  default?: unknown;
  choices?: string[];
  required?: boolean;
}

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
  dashboard?: {
    enabled: boolean;
    category?: string;
  };
  onLoad?: () => void;
  onUnload?: () => void;
}

export interface ModuleOptions extends Piece.Options {
  displayName?: string;
  emoji?: string;
  description?: string;
  version?: string;
  conflicts?: string[];
  dependencies?: string[];
  configFields?: ConfigField[];
  dashboard?: {
    enabled: boolean;
    category?: string;
  };
  isCore?: boolean;
}

/**
 * Decorator to attach metadata to a Module piece.
 */
export function EmberModule(options: ModuleOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- abstract class constructor signature requires any[] params
  return (ctor: abstract new (...args: any[]) => any) => {
    ApplyOptions<ModuleOptions>(options)(
      ctor as new (...args: never[]) => Module,
    );
    (ctor as unknown as { meta: ModuleOptions }).meta = options;
  };
}

export abstract class Module extends Piece {
  public readonly displayName: string;
  public readonly emoji: string;
  public readonly description: string;
  public readonly version: string;
  public readonly conflicts: string[];
  public readonly dependencies: string[];
  public readonly configFields: ConfigField[];
  public readonly dashboard?: { enabled: boolean; category?: string };
  public readonly isCore: boolean;

  public override enabled = true;

  public constructor(
    context: Piece.LoaderContext,
    options: ModuleOptions = {},
  ) {
    super(context, options);
    this.displayName = options.displayName ?? this.name;
    this.emoji = options.emoji ?? EmberEmojis.GEAR;
    this.description = options.description ?? "";
    this.version = options.version ?? "0.0.0";
    this.isCore = options.isCore ?? false;
    this.conflicts = options.conflicts ?? [];
    this.dependencies = options.dependencies ?? [];
    this.configFields = options.configFields ?? [];
    this.dashboard = options.dashboard;
  }

  public abstract registerServices(container: Container): void;

  public override onLoad() {
    this.registerServices(this.container);
    return super.onLoad();
  }

  public override onUnload() {
    return super.onUnload();
  }

  public deleteUserData(
    _userId: string,
    _requester: RequesterType,
  ): Awaitable<void> {
    return undefined;
  }
}
