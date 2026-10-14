import type { Message } from "discord.js";

export type GuildMessage = Message<true>;

export const LumiEvents = {
  GuildUserMessage: "lumiGuildUserMessage",
  GuildUserMessageEdit: "lumiGuildUserMessageEdit",
} as const;

declare module "discord.js" {
  interface ClientEvents {
    lumiGuildUserMessage: [message: Message<true>];
    lumiGuildUserMessageEdit: [message: Message<true>];
  }
}

import type { OutboundSendPayload } from "#src/lib/outbound/SendQueue.js";
import type { GdprExportFirePayload } from "#src/core/services/GdprExportTask.js";
import type { ModLiftPayload } from "#src/modules/mod/tasks/ModLift.js";
import type { WarnDecayPayload } from "#src/modules/mod/tasks/WarnDecay.js";
import type { AutoLockdownUnlockPayload } from "#src/modules/filter/tasks/AutoLockdownUnlock.js";
import type { AfkDeleteMessagePayload } from "#src/modules/afk/tasks/AfkDeleteMessage.js";
import type { TempVcCleanupPayload } from "#src/modules/tempvc/tasks/Cleanup.js";

export interface ModuleOneshotPayload {
  module: string;
  name: string;
  guildId: string;
  data?: unknown;
}

export interface ScheduledTasks {
  "flush-logs": Record<string, never>;
  "send-message": OutboundSendPayload;
  "addon-auto-update": Record<string, never>;
  "mod-lift": ModLiftPayload;
  "warn-decay": WarnDecayPayload;
  "security-verify-sweep": Record<string, never>;
  "security-backup-snapshot": Record<string, never>;
  "afk-delete-message": AfkDeleteMessagePayload;
  "tempvc-cleanup": TempVcCleanupPayload;
  "data-retention-sweep": Record<string, never>;
  "gdpr-export": GdprExportFirePayload;
  "gdpr-export-cleanup": Record<string, never>;
  "filter-auto-lockdown-unlock": AutoLockdownUnlockPayload;
  "module-oneshot": ModuleOneshotPayload;
}
