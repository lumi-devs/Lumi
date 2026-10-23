import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { runHub } from "../lumi/panel.ts";

export const lumiCommand: CommandDef = {
  name: "lumi",
  description: "Open the Lumi control panel.",
  module: null,
  guildOnly: true,
  permitNode: "admin.*",
  prefix: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("lumi")
      .setDescription("Open the Lumi control panel."),
  run: (ctx) => runHub(ctx),
};
