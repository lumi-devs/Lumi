import { defineModule } from "@lumi/bot-kit";
import { banCommand } from "./commands/ban.ts";
import { caseCommand } from "./commands/case.ts";
import { casesCommand } from "./commands/cases.ts";
import { dmCommand } from "./commands/dm.ts";
import { kickCommand } from "./commands/kick.ts";
import { lockCommand } from "./commands/lock.ts";
import { lockdownCommand } from "./commands/lockdown.ts";
import { notesCommand } from "./commands/notes.ts";
import { quarantineCommand } from "./commands/quarantine.ts";
import { reasonCommand } from "./commands/reason.ts";
import { sanitizeCommand } from "./commands/sanitize.ts";
import { softbanCommand } from "./commands/softban.ts";
import { timeoutCommand } from "./commands/timeout.ts";
import { unbanCommand } from "./commands/unban.ts";
import { untimeoutCommand } from "./commands/untimeout.ts";
import { vcmuteCommand } from "./commands/vcmute.ts";
import { warnCommand } from "./commands/warn.ts";
import { modConfigSchema } from "./config.ts";
import { quarantineRejoinListener } from "./listeners/quarantine-rejoin.ts";
import { voiceMuteStateListener } from "./listeners/voice-mute-state.ts";
import { startCaseExpirySweep } from "./tasks/expiry.ts";

let stopSweep: (() => void) | undefined;

const modModule = defineModule({
  name: "mod",
  displayName: "Moderation",
  emoji: "🔨",
  description: "Server moderation: bans, kicks, timeouts, voice mutes, warnings, cases, notes, lockdown, and quarantine.",
  config: modConfigSchema,
  configFields: [
    {
      key: "log_channel_id",
      label: "Mod Log Channel",
      type: "channel",
      description: "Channel where moderation cases are posted.",
    },
    {
      key: "dm_on_punish",
      label: "DM on Punish",
      type: "boolean",
      description: "Send the punished member a DM with the action and reason.",
    },
    {
      key: "quarantine_role_id",
      label: "Quarantine Role",
      type: "role",
      description: "Role assigned during quarantine. The member's other roles are saved and restored.",
    },
    {
      key: "warn_thresholds",
      label: "Warn Thresholds",
      type: "string",
      description:
        'JSON map of warn count to action, e.g. {"3":{"action":"mute","duration":"1h"},"5":{"action":"ban"}}. Duration accepts a string or seconds.',
    },
    {
      key: "immune_role_ids",
      label: "Immune Roles",
      type: "multi-role",
      description:
        "Roles exempt from automated escalation and warn-threshold actions. Manual staff commands still work.",
    },
  ],
  commands: [
    banCommand,
    unbanCommand,
    kickCommand,
    timeoutCommand,
    untimeoutCommand,
    softbanCommand,
    warnCommand,
    casesCommand,
    caseCommand,
    reasonCommand,
    notesCommand,
    lockCommand,
    lockdownCommand,
    quarantineCommand,
    dmCommand,
    sanitizeCommand,
    vcmuteCommand,
  ],
  listeners: [quarantineRejoinListener, voiceMuteStateListener],
  onLoad(services) {
    stopSweep = startCaseExpirySweep(services);
    services.logger.info({ module: "mod" }, "mod module loaded");
  },
  onUnload() {
    stopSweep?.();
    stopSweep = undefined;
  },
});

export default modModule;
