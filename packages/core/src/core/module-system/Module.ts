import { Piece } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import type { RequesterType } from "../lib/gdpr.js";
import { ApplyOptions } from "@sapphire/decorators";
import { EmberEmojis } from "#utilities/assets.js";
import type { z } from "zod";
import { fieldsFromSchema, type ConfigField } from "./config-schema.js";

// Config is Zod-first: modules declare a single `configSchema` (see config-schema.ts)
// and the flat `ConfigField[]` below is derived from it. `FieldType`/`ConfigField`/`cfg`
// are re-exported here so existing `#core/module-system/Module.js` imports keep working.
export {
  FieldType,
  type ConfigField,
  cfg,
  parseConfigList,
} from "./config-schema.js";

// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleMeta {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  isCore?: boolean;
  conflicts?: string[];
  dependencies?: string[];
  /** Derived from `configSchema` by the `EmberModule` decorator — not hand-authored. */
  configFields?: ConfigField[];
  configSchema?: z.ZodObject<z.ZodRawShape>;
  configOverrides?: boolean;
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
  /** Derived from `configSchema` by the `EmberModule` decorator — not hand-authored. */
  configFields?: ConfigField[];
  configSchema?: z.ZodObject<z.ZodRawShape>;
  configOverrides?: boolean;
  isCore?: boolean;
}

/**
 * Decorator to attach metadata to a Module piece. Derives the flat `configFields`
 * (consumed by the `/config` panel and dashboard RPC) from the Zod `configSchema`.
 */
export function EmberModule(options: ModuleOptions) {
  if (options.configSchema) {
    options.configFields = fieldsFromSchema(options.configSchema);
  }
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
    this.configFields =
      options.configFields ??
      (options.configSchema ? fieldsFromSchema(options.configSchema) : []);
  }

  public deleteUserData(
    _userId: string,
    _requester: RequesterType,
  ): Awaitable<void> {
    return undefined;
  }

  /**
   * Re-arm any delayed BullMQ jobs this module owns that should still fire after
   * a restart (mute lifts, captcha expiries, etc.). Called once per module load.
   * Override in modules that create one-shot delayed tasks; the base is a no-op.
   *
   * Why: BullMQ persists jobs in Redis, but a job whose row was written before
   * the worker that scheduled it crashed may have lost its in-memory bookkeeping
   * (or, post-S5 split, be owned by a peer process). This hook is the single
   * place each module reconciles "what should be scheduled" against "what is".
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
