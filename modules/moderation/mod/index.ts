import { defineModule, type ModuleDefinition } from "@lumi/module-kit";
import { banAdd, banRemove } from "./commands/ban.js";
import {
  casesDef,
  casesPaginationListener,
  caseDef,
} from "./commands/case.js";
import { lockdownDef, lockDef, unlockDef } from "./commands/channel.js";
import { kickDef } from "./commands/kick.js";
import { noteDef } from "./commands/note.js";
import { purgeDef } from "./commands/purge.js";
import {
  quarantineDef,
  unquarantineDef,
} from "./commands/quarantine.js";
import { softbanDef } from "./commands/softban.js";
import { timeoutDef } from "./commands/timeout.js";
import { vcmuteDef, vcmuteRemoveDef } from "./commands/voice.js";
import { warnDef } from "./commands/warn.js";
import { ModerationModuleName } from "./constants.js";

const modModule: ModuleDefinition = defineModule({
  name: ModerationModuleName,
  displayName: "Moderation",
  emoji: "🛡️",
  description:
    "Case-backed moderation with bans, kicks, timeouts, warns, purge, notes, lockdown, softban, quarantine, voice mute",
  version: "2.0.0",
  config: {
    quarantineRoleId: null,
    maxTargets: 10,
    immuneRoleIds: [],
    warnThresholds: {},
  },
  configFields: [
    {
      key: "quarantineRoleId",
      label: "Quarantine Role",
      type: "role",
      description: "Role assigned when quarantined",
      default: null,
      category: "Quarantine",
    },
    {
      key: "maxTargets",
      label: "Max Targets",
      type: "number",
      description: "Max members per command",
      default: 10,
      category: "Limits",
    },
    {
      key: "immuneRoleIds",
      label: "Immune Roles",
      type: "multi-role",
      description: "Roles exempt from auto-actions",
      default: [],
      category: "Exemptions",
    },
    {
      key: "warnThresholds",
      label: "Warn Thresholds",
      type: "json",
      description: "JSON object: warn count -> {action, duration}",
      default: {},
      category: "Warn Escalation",
    },
  ],
  commands: [
    banAdd,
    banRemove,
    kickDef,
    timeoutDef,
    warnDef,
    purgeDef,
    noteDef,
    lockDef,
    unlockDef,
    lockdownDef,
    softbanDef,
    quarantineDef,
    unquarantineDef,
    vcmuteDef,
    vcmuteRemoveDef,
    caseDef,
    casesDef,
  ],
  listeners: [casesPaginationListener],
  tasks: [],
  async onLoad(_services) {
    console.log("[mod] Module loaded");
    return [];
  },
  async onUnload(_services) {
    console.log("[mod] Module unloaded");
  },
});

export default modModule;
