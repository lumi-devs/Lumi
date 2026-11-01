import {
  defineModule,
  type ModuleDefinition,
  type TaskDefinition,
} from "@lumi/module-kit";
import { statsCommand } from "./commands.js";
import { StatsConfigSchema } from "./config.js";
import { StatsModuleName } from "./constants.js";
import { purgeOldStats } from "./retention.js";
import { captureAllSnapshots } from "./snapshots.js";
import {
  flushVoiceSessions,
  statsListeners as trackingListeners,
} from "./tracking.js";

const snapshotTask: TaskDefinition = {
  name: "snapshot",
  cron: "*/10 * * * *",
  timezone: "UTC",
  async handler(services) {
    await captureAllSnapshots(services);
  },
};

const retentionTask: TaskDefinition = {
  name: "retention",
  cron: "*/1440 * * * *",
  timezone: "UTC",
  async handler(services) {
    await purgeOldStats(services);
  },
};

const statsModule: ModuleDefinition = defineModule({
  name: StatsModuleName,
  displayName: "Server Stats",
  emoji: "📊",
  description:
    "Server statistics with message, voice, member, status, and boost tracking",
  version: "1.0.0",
  config: StatsConfigSchema,
  commands: [statsCommand],
  listeners: trackingListeners,
  tasks: [snapshotTask, retentionTask],
  async onLoad(_services) {
    console.log("[stats] Module loaded");
    return [];
  },
  async onUnload(services) {
    await flushVoiceSessions(services);
    console.log("[stats] Module unloaded");
  },
});

export default statsModule;
