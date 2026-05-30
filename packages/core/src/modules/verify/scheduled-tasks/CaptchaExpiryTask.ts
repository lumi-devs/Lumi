import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "captcha-expiry",
  interval: 120_000, // 2 minutes
})
export class CaptchaExpiryTask extends ScheduledTask {
  // Scheduler-side: relay onto the bus. Each worker (broadcast mode) iterates
  // its own guilds.cache in `handleCaptchaExpiryFire`.
  public async run(): Promise<void> {
    await publishTaskFire("captcha-expiry", {});
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "captcha-expiry": Record<string, never>;
  }
}
