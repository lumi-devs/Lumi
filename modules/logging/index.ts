import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const LoggingConfigSchema = z.object({
  messageLogChannel: z.string().nullable().default(null),
  editLogChannel: z.string().nullable().default(null),
  deleteLogChannel: z.string().nullable().default(null),
  voiceLogChannel: z.string().nullable().default(null),
  ignoredChannels: z.array(z.string(), {}).default([]),
}, {});

const LoggingSupermodule = defineModule({
  name: "logging",
  displayName: "Logging",
  emoji: "📝",
  description: "Message, edit, delete, and voice logging",
  version: "2.0.0",
  config: LoggingConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[logging] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[logging] Supermodule unloaded");
  },
});

export default LoggingSupermodule;
