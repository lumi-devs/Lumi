import { ApplyOptions } from "@sapphire/decorators";
import { container, type Command } from "@sapphire/framework";
import { BaseSubcommand, type CommandContext } from "lumi/commands";
import { deleteTag, getTag, listTags, resetTags, setTag } from "../lib/store.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "tag",
  description: "Manage and recall custom tags.",
  subcommands: [
    { name: "add", run: "add" },
    { name: "remove", run: "remove" },
    { name: "list", run: "list" },
    { name: "reset", run: "reset" },
    { name: "get", run: "get" },
  ],
})
export default class TagCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Create or update a tag.")
            .addStringOption((opt) => opt.setName("name").setDescription("Tag name.").setRequired(true))
            .addStringOption((opt) =>
              opt.setName("response").setDescription("What the tag replies with.").setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Delete a tag.")
            .addStringOption((opt) => opt.setName("name").setDescription("Tag name.").setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName("get")
            .setDescription("Look up a tag.")
            .addStringOption((opt) => opt.setName("name").setDescription("Tag name.").setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List every tag in this server."))
        .addSubcommand((sub) => sub.setName("reset").setDescription("Delete every tag in this server.")),
    );
  }

  public async add(ctx: CommandContext) {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This command only works in a server.");

    const enabled = await container.db.config.getModuleConfig(ctx.guildId, "tag-manager", "enabled");
    if (enabled === false) {
      return ctx.replyWarning("Disabled", "Tags are disabled for this server - enable them from `/config`.");
    }

    const name = (await ctx.getString("name", { required: true }))!.toLowerCase();
    const response = (await ctx.getString("response", { required: true }))!;

    const existing = await getTag(ctx.guildId, name);
    if (!existing) {
      const maxTagsRaw = await container.db.config.getModuleConfig(ctx.guildId, "tag-manager", "max_tags");
      const maxTags = typeof maxTagsRaw === "number" ? maxTagsRaw : 25;
      const current = await listTags(ctx.guildId);
      if (current.length >= maxTags) {
        return ctx.replyError(
          "Tag Limit Reached",
          `This server already has ${current.length}/${maxTags} tags. Remove one first, or raise the limit in \`/config\`.`,
        );
      }
    }

    await setTag(ctx.guildId, name, { response, createdBy: ctx.user.id, createdAt: Date.now() });
    return ctx.replySuccess("Tag Saved", `\`${name}\` ${existing ? "updated" : "created"}.`);
  }

  public async remove(ctx: CommandContext) {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This command only works in a server.");
    const name = (await ctx.getString("name", { required: true }))!.toLowerCase();

    const removed = await deleteTag(ctx.guildId, name);
    if (!removed) return ctx.replyWarning("Not Found", `No tag named \`${name}\`.`);
    return ctx.replySuccess("Tag Removed", `\`${name}\` deleted.`);
  }

  public async get(ctx: CommandContext) {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This command only works in a server.");
    const name = (await ctx.getString("name", { required: true }))!.toLowerCase();

    const tag = await getTag(ctx.guildId, name);
    if (!tag) {
      const fallbackRaw = await container.db.config.getModuleConfig(ctx.guildId, "tag-manager", "default_response");
      const fallback = typeof fallbackRaw === "string" ? fallbackRaw : "That tag doesn't exist.";
      return ctx.replyWarning("Not Found", fallback);
    }

    return ctx.replyInfo(`\`${name}\``, tag.response);
  }

  public async list(ctx: CommandContext) {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This command only works in a server.");
    const tags = await listTags(ctx.guildId);

    if (tags.length === 0) return ctx.replyInfo("No Tags", "This server has no tags yet - create one with `/tag add`.");

    const names = tags.map((t) => `\`${t.name}\``).join(", ");
    return ctx.replyInfo(`Tags (${tags.length})`, names);
  }

  public async reset(ctx: CommandContext) {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This command only works in a server.");
    const deleted = await resetTags(ctx.guildId);
    return ctx.replySuccess("Tags Reset", `Deleted ${deleted} tag${deleted === 1 ? "" : "s"}.`);
  }
}
