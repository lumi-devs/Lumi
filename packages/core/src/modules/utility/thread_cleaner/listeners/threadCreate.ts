import { ApplyOptions } from "@sapphire/decorators";
import { Listener, Events } from "@sapphire/framework";
import { ThreadChannel } from "discord.js";
import { trackThread } from "../data.js";
import { parseDuration } from "#utilities/time.js";
import { parseConfigList } from "#core/module-system/Module.js";
import { isModuleEnabled } from "#utilities/listeners.js";

@ApplyOptions<Listener.Options>({
  event: Events.ThreadCreate,
})
export class ThreadCreateListener extends Listener {
  public async run(thread: ThreadChannel) {
    if (!thread.guild) return;
    if (!(await isModuleEnabled(thread.guild.id, "thread_cleaner"))) return;

    const enabledChannels = parseConfigList(
      await this.container.db.config.getModuleConfig(
        thread.guild.id,
        "thread_cleaner",
        "enabled_channels",
      ),
    );
    const parentChannelId = thread.parentId;

    if (!parentChannelId || !enabledChannels.includes(parentChannelId)) {
      return;
    }

    const inactiveDurationStr =
      ((await this.container.db.config.getModuleConfig(
        thread.guild.id,
        "thread_cleaner",
        "inactive_duration",
      )) as string | null) ?? "3d";
    const durationSeconds = parseDuration(inactiveDurationStr);

    if (durationSeconds === null) {
      this.container.logger.warn(
        `[ThreadCleaner] Invalid duration format "${inactiveDurationStr}" for guild ${thread.guild.id}`,
      );
      return;
    }

    const archiveAt = new Date(Date.now() + durationSeconds * 1000);

    try {
      await trackThread(thread.id, thread.guild.id, parentChannelId, archiveAt);
      this.container.logger.debug(
        `[ThreadCleaner] Tracking new thread ${thread.id} in guild ${thread.guild.id}. Scheduled for archival at ${archiveAt.toISOString()}`,
      );
    } catch (error) {
      this.container.logger.error(
        `[ThreadCleaner] Failed to track thread ${thread.id} in guild ${thread.guild.id}`,
        error,
      );
    }
  }
}
