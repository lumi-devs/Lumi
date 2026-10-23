import type { SharedSlashCommand } from "discord.js";
import type { CommandContext } from "./context.ts";

export interface CommandDef {
  readonly name: string;
  readonly description: string;
  readonly module: string | null;
  readonly guildOnly?: boolean;
  readonly ownerOnly?: boolean;
  readonly guildOwnerOnly?: boolean;
  readonly requiredPermissions?: bigint;
  readonly cooldownMs?: number;
  readonly prefix?: boolean;
  readonly build?: () => SharedSlashCommand;
  run(context: CommandContext): Promise<unknown>;
}
