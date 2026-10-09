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

import type { OutboundSendPayload } from "#lib/outbound/send-queue.js";
import type { AddonRelayPayload } from "#lib/addon-sandbox/relay-task.js";
import type { GdprExportFirePayload } from "#modules/core/services/gdpr-export-task.js";
import type { ModLiftPayload } from "#modules/mod/scheduled-tasks/modLift.js";
import type { WarnDecayPayload } from "#modules/mod/scheduled-tasks/warnDecay.js";
import type { AutoLockdownUnlockPayload } from "#modules/filter/scheduled-tasks/autoLockdownUnlock.js";
import type { AfkDeleteMessagePayload } from "#modules/afk/scheduled-tasks/afkDeleteMessage.js";
import type { TempVcCleanupPayload } from "#modules/tempvc/scheduled-tasks/cleanup.js";

export interface ScheduledTasks {
  "flush-logs": Record<string, never>;
  "send-message": OutboundSendPayload;
  "addon-auto-update": Record<string, never>;
  "addon-relay": AddonRelayPayload;
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
}
