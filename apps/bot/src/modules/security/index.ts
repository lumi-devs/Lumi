import { defineModule } from "@lumi/bot-kit";
import { securityConfigSchema } from "./config.ts";
import { panicCommand } from "./commands/panic.ts";
import { verifyPanelCommand } from "./commands/verifypanel.ts";
import { securityMemberJoinListener } from "./listeners/member-join.ts";
import { startVerificationSweep } from "./tasks/sweep.ts";

let stopSweep: (() => void) | undefined;

const securityModule = defineModule({
  name: "security",
  displayName: "Security",
  emoji: "🛡️",
  description: "Server protection: verification panels, human checks, and emergency panic lockdown.",
  config: securityConfigSchema,
  configFields: [
    {
      key: "verification_enabled",
      label: "Verification",
      type: "boolean",
      description: "Require new members to verify before they can access the server.",
    },
    {
      key: "verified_role_id",
      label: "Verified Role",
      type: "role",
      description: "Role granted after passing verification.",
    },
    {
      key: "verification_pending_role_id",
      label: "Pending Role",
      type: "role",
      description: "Optional role assigned on join and removed once verified.",
    },
    {
      key: "panic_lock_channel_ids",
      label: "Panic Channels",
      type: "multi-channel",
      description: "Channels locked by /panic. Leave empty to lock every text channel.",
    },
    {
      key: "verification_mode",
      label: "Verification Mode",
      type: "string",
      description: "emoji for a sequence challenge, none for a single Verify button.",
    },
    {
      key: "verification_target",
      label: "Verification Target",
      type: "string",
      description: "everyone requires all new members to verify; suspicious only targets new or avatarless accounts.",
    },
    {
      key: "verification_timeout_minutes",
      label: "Verify Timeout (minutes)",
      type: "number",
      min: 1,
      max: 1_440,
      description: "How long a member has to pass verification.",
    },
    {
      key: "verification_kick_on_timeout",
      label: "Kick on Timeout",
      type: "boolean",
      description: "Kick members who do not verify before the timeout.",
    },
  ],
  commands: [verifyPanelCommand, panicCommand],
  listeners: [securityMemberJoinListener],
  onLoad(services) {
    stopSweep = startVerificationSweep(services);
    services.logger.info({ module: "security" }, "security module loaded");
  },
  onUnload() {
    stopSweep?.();
    stopSweep = undefined;
  },
});

export default securityModule;
