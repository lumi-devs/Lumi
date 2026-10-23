import { describe, expect, it } from "bun:test";
import { SlashCommandBuilder, type Message } from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { CommandContextImpl } from "../src/runtime/context.ts";

const base = {
  content: "",
  guildId: "guild",
  guild: null,
  channel: null,
  member: null,
  author: { id: "moderator" },
};

function contextFor(command: CommandDef, args: string[]): CommandContextImpl {
  return new CommandContextImpl({} as never, command, base as unknown as Message, args);
}

const notes: CommandDef = {
  name: "notes",
  description: "notes",
  module: "mod",
  build: () =>
    new SlashCommandBuilder()
      .setName("notes")
      .setDescription("notes")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("add")
          .addUserOption((option) => option.setName("user").setDescription("user").setRequired(true))
          .addStringOption((option) =>
            option.setName("note").setDescription("note").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("list")
          .addUserOption((option) => option.setName("user").setDescription("user").setRequired(true)),
      ),
  async run() {},
};

const cases: CommandDef = {
  name: "cases",
  description: "cases",
  module: "mod",
  build: () =>
    new SlashCommandBuilder()
      .setName("cases")
      .setDescription("cases")
      .addUserOption((option) => option.setName("user").setDescription("user"))
      .addIntegerOption((option) => option.setName("page").setDescription("page")),
  async run() {},
};

describe("prefix argument parsing", () => {
  it("maps subcommand options after the subcommand token", async () => {
    const ctx = contextFor(notes, ["add", "<@123>", "spamming", "in", "general"]);

    expect(ctx.getSubcommand()).toBe("add");
    expect(await ctx.getString("note", { rest: true })).toBe("spamming in general");
    expect(await ctx.getInteger("page")).toBeNull();
  });

  it("maps top-level options when a command has no subcommands", async () => {
    const ctx = contextFor(cases, ["<@123>", "3"]);

    expect(ctx.getSubcommand()).toBe("<@123>");
    expect(await ctx.getInteger("page")).toBe(3);
  });

  it("returns null instead of borrowing the subcommand token for unknown options", async () => {
    const ctx = contextFor(notes, ["list", "<@123>"]);
    expect(await ctx.getInteger("page")).toBeNull();
  });
});

describe("slash argument parsing", () => {
  it("does not treat prefix-only rest as the resolver's required flag", async () => {
    const command: CommandDef = {
      name: "ban",
      description: "ban",
      module: "mod",
      build: () =>
        new SlashCommandBuilder()
          .setName("ban")
          .setDescription("ban")
          .addStringOption((option) => option.setName("reason").setDescription("reason")),
      async run() {},
    };
    const source = {
      user: { id: "moderator" },
      guildId: "guild",
      guild: null,
      channel: null,
      member: null,
      options: {
        getString: (_name: string, required?: boolean) => {
          if (required) throw new Error("required flag must not be set");
          return "full reason text";
        },
      },
    };

    const ctx = new CommandContextImpl({} as never, command, source as never);
    expect(await ctx.getString("reason", { rest: true })).toBe("full reason text");
  });
});
