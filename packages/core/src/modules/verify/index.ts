import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleCaptchaExpiryFire } from "./lib/captcha-expiry-handler.js";

@DefineModule({
  name: "verify",
  displayName: "Verification",
  emoji: "✅",
  version: "1.0.0",
  description: "Math captcha verification for new members.",
  configSchema: cfg.object({
    pending_role_id: cfg.role({
      label: "Pending Role",
      description: "Role assigned to unverified members.",
    }),
    verified_role_id: cfg.role({
      label: "Verified Role",
      description: "Role granted after passing the captcha.",
    }),
    timeout_minutes: cfg.number({
      label: "Timeout (minutes)",
      description: "Minutes before an unverified member is kicked.",
      default: 5,
    }),
    kick_on_timeout: cfg.boolean({
      label: "Kick on Timeout",
      description: "Whether to kick members who don't verify in time.",
      default: true,
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel to post verification events.",
    }),
  }),
})
export class VerifyModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "captcha-expiry",
      "broadcast",
      handleCaptchaExpiryFire,
    );
    return super.onLoad();
  }
}
