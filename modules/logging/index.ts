import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const LoggingConfigSchema = z.object({
  messageLogChannel: z.string().nullable().default(null),
  editLogChannel: z.string().nullable().default(null),
  deleteLogChannel: z.string().nullable().default(null),
  voiceLogChannel: z.string().nullable().default(null),
  modLogChannel: z.string().nullable().default(null),
  ignoredChannels: z.array(z.string(), {}).default([]),
}, {});

const LoggingSupermodule = defineModule({
  name: "logging",
  displayName: "Logging",
  emoji: "📝",
  description: "Message, edit, delete, voice, and moderation logging",
  version: "2.0.0",
  config: LoggingConfigSchema,
  configFields: [
    { key: "messageLogChannel", label: "Message Log Channel", type: "channel", description: "Log message edits/deletes" },
    { key: "editLogChannel", label: "Edit Log Channel", type: "channel", description: "Log message edits" },
    { key: "deleteLogChannel", label: "Delete Log Channel", type: "channel", description: "Log message deletes" },
    { key: "voiceLogChannel", label: "Voice Log Channel", type: "channel", description: "Log voice state changes" },
    { key: "modLogChannel", label: "Mod Log Channel", type: "channel", description: "Log moderation actions" },
    { key: "ignoredChannels", label: "Ignored Channels", type: "multi-channel", description: "Channels to exclude from logging" },
  ],
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
