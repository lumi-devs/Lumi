import {
  SlashCommandBuilder,
  channelMention,
  roleMention,
  userMention,
} from "discord.js";
import {
  evaluatePermit,
  type CommandDef,
  type PermitKind,
  type PermitPolarity,
  type PermitTargetType,
} from "@lumi/bot-kit";
import {
  makeCard,
  makeErrorCard,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
  resolveCardColor,
} from "@lumi/ui";

export const permitCommand: CommandDef = {
  name: "permit",
  description: "Manage and inspect server permission rules and permits.",
  module: null,
  guildOnly: true,
  // Permit management follows the same app-level gate as the /lumi panel.
  // Discord managers pass the resolver's manager tier; custom `admin.*`
  // holders pass the permit tier.
  permitNode: "admin.*",
  build: () =>
    new SlashCommandBuilder()
      .setName("permit")
      .setDescription("Manage and inspect server permission rules and permits.")
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List all permits and their positions in this server."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("show")
          .setDescription("Show details and assignments for a specific permit.")
          .addStringOption((opt) => opt.setName("permit").setDescription("Permit name or ID").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a new permit rule.")
          .addStringOption((opt) => opt.setName("name").setDescription("Unique name for this permit").setRequired(true))
          .addStringOption((opt) =>
            opt.setName("nodes").setDescription("Comma-separated permit nodes (e.g. mod.*, utility.purge)").setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName("kind")
              .setDescription("Permit kind")
              .addChoices({ name: "Custom (Users, Roles, Channels)", value: "custom" }, { name: "Enforced (Users only)", value: "enforced" }),
          )
          .addStringOption((opt) =>
            opt
              .setName("polarity")
              .setDescription("Grant or Deny access")
              .addChoices({ name: "Grant (Allow)", value: "grant" }, { name: "Deny (Block)", value: "deny" }),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a custom permit.")
          .addStringOption((opt) => opt.setName("permit").setDescription("Permit name or ID").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("nodes")
          .setDescription("Modify the nodes of an existing permit.")
          .addStringOption((opt) => opt.setName("permit").setDescription("Permit name or ID").setRequired(true))
          .addStringOption((opt) =>
            opt
              .setName("action")
              .setDescription("How to update the nodes")
              .setRequired(true)
              .addChoices({ name: "Set (Replace)", value: "set" }, { name: "Add", value: "add" }, { name: "Remove", value: "remove" }),
          )
          .addStringOption((opt) => opt.setName("nodes").setDescription("Comma-separated permit nodes").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("assign")
          .setDescription("Assign a permit to a user, role, or channel.")
          .addStringOption((opt) => opt.setName("permit").setDescription("Permit name or ID").setRequired(true))
          .addStringOption((opt) =>
            opt
              .setName("type")
              .setDescription("Target type")
              .setRequired(true)
              .addChoices({ name: "User", value: "user" }, { name: "Role", value: "role" }, { name: "Channel", value: "channel" }),
          )
          .addStringOption((opt) => opt.setName("target_id").setDescription("User ID, Role ID, or Channel ID").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("unassign")
          .setDescription("Remove a permit assignment.")
          .addStringOption((opt) => opt.setName("permit").setDescription("Permit name or ID").setRequired(true))
          .addStringOption((opt) =>
            opt
              .setName("type")
              .setDescription("Target type")
              .setRequired(true)
              .addChoices({ name: "User", value: "user" }, { name: "Role", value: "role" }, { name: "Channel", value: "channel" }),
          )
          .addStringOption((opt) => opt.setName("target_id").setDescription("User ID, Role ID, or Channel ID").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("move")
          .setDescription("Move a permit up or down in the evaluation priority chain.")
          .addStringOption((opt) => opt.setName("permit").setDescription("Permit name or ID").setRequired(true))
          .addStringOption((opt) =>
            opt
              .setName("direction")
              .setDescription("Move direction")
              .setRequired(true)
              .addChoices({ name: "Up (Higher Priority)", value: "up" }, { name: "Down (Lower Priority)", value: "down" }),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("check")
          .setDescription("Test and explain permit resolution for a specific user and node.")
          .addUserOption((opt) => opt.setName("user").setDescription("User to test").setRequired(true))
          .addStringOption((opt) => opt.setName("node").setDescription("Permit node to test (e.g. mod.ban)").setRequired(true)),
      ),
  async run(ctx) {
    const guildId = ctx.guildId;
    if (!guildId) return ctx.reply(makeErrorCard("Server Only", "Permits can only be managed inside a server."));

    const sub = ctx.getSubcommand();

    if (!sub || sub === "list") {
      const permits = await ctx.services.db.permits.listPermits(guildId);
      if (permits.length === 0) {
        return ctx.reply(makeInfoCard("Permits", "No permits configured for this server."));
      }

      const lines = permits.map((p) => {
        const polBadge = p.polarity === "deny" ? "⛔ DENY" : "✅ GRANT";
        const kindBadge = p.kind === "enforced" ? "🔒 Enforced" : "⚙️ Custom";
        const builtinBadge = p.builtin ? " • Builtin" : "";
        const assignmentCount = p.assignments.length;
        const nodePreview = p.nodes.length > 0 ? p.nodes.slice(0, 3).map((n) => `\`${n}\``).join(", ") + (p.nodes.length > 3 ? ` (+${p.nodes.length - 3})` : "") : "*none*";

        return `**#${p.position}** • **${p.name}** [${polBadge} | ${kindBadge}${builtinBadge}]\n  Nodes: ${nodePreview}\n  Assignments: **${assignmentCount}** target${assignmentCount === 1 ? "" : "s"}`;
      });

      return ctx.reply(
        makeListCard(`Server Permits (${permits.length})`, lines, {
          subtitle: "Evaluated top-to-bottom. Enforced rules evaluate before custom rules.",
        }),
      );
    }

    if (sub === "show") {
      const permitInput = await ctx.getString("permit");
      if (!permitInput) return ctx.reply(makeErrorCard("Missing Argument", "Specify a permit name or ID."));

      const permit = await ctx.services.db.permits.findPermitByNameOrId(guildId, permitInput);
      if (!permit) return ctx.reply(makeErrorCard("Not Found", `Permit **${permitInput}** does not exist.`));

      const assignees = permit.assignments.map((a) => {
        if (a.targetType === "user") return `👤 ${userMention(a.targetId)} (\`${a.targetId}\`)`;
        if (a.targetType === "role") return `🏷️ ${roleMention(a.targetId)} (\`${a.targetId}\`)`;
        return `📁 ${channelMention(a.targetId)} (\`${a.targetId}\`)`;
      });

      const body = [
        `**ID:** \`${permit.id}\` • **Position:** \`#${permit.position}\``,
        `**Type:** \`${permit.kind}\` • **Polarity:** \`${permit.polarity.toUpperCase()}\` • **Builtin:** \`${permit.builtin ? "Yes" : "No"}\``,
        `\n### Configured Nodes\n${permit.nodes.length > 0 ? permit.nodes.map((n) => `• \`${n}\``).join("\n") : "*No nodes assigned.*"}`,
        `\n### Assignments (${permit.assignments.length})\n${assignees.length > 0 ? assignees.join("\n") : "*No targets assigned to this permit.*"}`,
      ].join("\n");

      return ctx.reply(
        makeCard(resolveCardColor("info"), `Permit: ${permit.name}`, body, {
          breadcrumbs: ["Permits", permit.name],
        }),
      );
    }

    if (sub === "create") {
      const name = (await ctx.getString("name"))?.trim();
      const nodesRaw = await ctx.getString("nodes");
      const kind = (((await ctx.getString("kind")) ?? "custom") as PermitKind);
      const polarity = (((await ctx.getString("polarity")) ?? "grant") as PermitPolarity);

      if (!name || !nodesRaw) {
        return ctx.reply(makeErrorCard("Invalid Usage", "Provide both a name and comma-separated permit nodes."));
      }

      const nodes = nodesRaw.split(",").map((n: string) => n.trim().toLowerCase()).filter(Boolean);
      try {
        const created = await ctx.services.db.permits.createPermit(guildId, {
          name,
          nodes,
          kind,
          polarity,
        });

        return ctx.reply(
          makeSuccessCard(
            "Permit Created",
            `Created permit **${created.name}** at priority position **#${created.position}**.\nPolarity: **${created.polarity.toUpperCase()}** • Nodes: ${nodes.map((n: string) => `\`${n}\``).join(", ")}`,
          ),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to create permit.";
        return ctx.reply(makeErrorCard("Error", msg));
      }
    }

    if (sub === "delete") {
      const permitInput = await ctx.getString("permit");
      if (!permitInput) return ctx.reply(makeErrorCard("Missing Argument", "Specify a permit name or ID."));

      const permit = await ctx.services.db.permits.findPermitByNameOrId(guildId, permitInput);
      if (!permit) return ctx.reply(makeErrorCard("Not Found", `Permit **${permitInput}** does not exist.`));
      if (permit.builtin) return ctx.reply(makeErrorCard("Protected", "Built-in permits cannot be deleted."));

      const deleted = await ctx.services.db.permits.deletePermit(guildId, permit.id);
      if (deleted) {
        return ctx.reply(makeSuccessCard("Permit Deleted", `Deleted permit **${permit.name}** and cleaned up its assignments.`));
      }
      return ctx.reply(makeErrorCard("Failed", "Could not delete permit."));
    }

    if (sub === "nodes") {
      const permitInput = await ctx.getString("permit");
      const action = await ctx.getString("action");
      const nodesRaw = await ctx.getString("nodes");

      if (!permitInput || !action || !nodesRaw) {
        return ctx.reply(makeErrorCard("Invalid Usage", "Usage: `/permit nodes <permit> <set|add|remove> <nodes>`"));
      }

      const permit = await ctx.services.db.permits.findPermitByNameOrId(guildId, permitInput);
      if (!permit) return ctx.reply(makeErrorCard("Not Found", `Permit **${permitInput}** does not exist.`));

      const inputNodes = nodesRaw.split(",").map((n: string) => n.trim().toLowerCase()).filter(Boolean);
      if (inputNodes.length === 0) {
        return ctx.reply(makeErrorCard("Invalid Nodes", "Provide at least one permit node."));
      }

      let updatedNodes: string[];
      if (action === "set") {
        updatedNodes = inputNodes;
      } else if (action === "add") {
        updatedNodes = Array.from(new Set([...permit.nodes, ...inputNodes]));
      } else if (action === "remove") {
        const removeSet = new Set(inputNodes);
        updatedNodes = permit.nodes.filter((n) => !removeSet.has(n));
      } else {
        return ctx.reply(makeErrorCard("Invalid Action", "Choose `set`, `add`, or `remove`."));
      }

      if (updatedNodes.length === 0) {
        return ctx.reply(
          makeErrorCard("Invalid Nodes", "A permit must keep at least one node."),
        );
      }

      try {
        const updated = await ctx.services.db.permits.updatePermit(guildId, permit.id, {
          nodes: updatedNodes,
        });
        return ctx.reply(
          makeSuccessCard(
            "Nodes Updated",
            `Updated nodes for **${permit.name}**:\n${updated?.nodes.map((n) => `\`${n}\``).join(", ") || "*No nodes*"}`,
          ),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to update nodes.";
        return ctx.reply(makeErrorCard("Error", msg));
      }
    }

    if (sub === "assign") {
      const permitInput = await ctx.getString("permit");
      const targetType = (await ctx.getString("type")) as PermitTargetType;
      const targetId = (await ctx.getString("target_id"))?.replace(/[^0-9]/g, "");

      if (
        !permitInput ||
        !targetId ||
        (targetType !== "user" && targetType !== "role" && targetType !== "channel")
      ) {
        return ctx.reply(makeErrorCard("Invalid Usage", "Provide permit, target type (user|role|channel), and target ID."));
      }

      const permit = await ctx.services.db.permits.findPermitByNameOrId(guildId, permitInput);
      if (!permit) return ctx.reply(makeErrorCard("Not Found", `Permit **${permitInput}** does not exist.`));

      if (permit.kind === "enforced" && targetType !== "user") {
        return ctx.reply(makeErrorCard("Invalid Target", "Enforced permits can only be assigned directly to Users."));
      }

      try {
        await ctx.services.db.permits.assignPermit(guildId, permit.id, targetType, targetId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to assign permit.";
        return ctx.reply(makeErrorCard("Error", msg));
      }
      const mention = targetType === "user" ? userMention(targetId) : targetType === "role" ? roleMention(targetId) : channelMention(targetId);

      return ctx.reply(
        makeSuccessCard("Permit Assigned", `Assigned **${permit.name}** to ${mention} (\`${targetId}\`).`),
      );
    }

    if (sub === "unassign") {
      const permitInput = await ctx.getString("permit");
      const targetType = (await ctx.getString("type")) as PermitTargetType;
      const targetId = (await ctx.getString("target_id"))?.replace(/[^0-9]/g, "");

      if (
        !permitInput ||
        !targetId ||
        (targetType !== "user" && targetType !== "role" && targetType !== "channel")
      ) {
        return ctx.reply(makeErrorCard("Invalid Usage", "Provide permit, target type (user|role|channel), and target ID."));
      }

      const permit = await ctx.services.db.permits.findPermitByNameOrId(guildId, permitInput);
      if (!permit) return ctx.reply(makeErrorCard("Not Found", `Permit **${permitInput}** does not exist.`));

      const unassigned = await ctx.services.db.permits.unassignPermit(guildId, permit.id, targetType, targetId);
      if (unassigned) {
        return ctx.reply(makeSuccessCard("Permit Unassigned", `Removed assignment of **${permit.name}** from target \`${targetId}\`.`));
      }
      return ctx.reply(makeErrorCard("Not Found", `No assignment found for target \`${targetId}\` on permit **${permit.name}**.`));
    }

    if (sub === "move") {
      const permitInput = await ctx.getString("permit");
      const direction = (await ctx.getString("direction")) as "up" | "down";

      if (!permitInput || (direction !== "up" && direction !== "down")) {
        return ctx.reply(makeErrorCard("Invalid Usage", "Specify permit and direction (`up` or `down`)."));
      }

      const permit = await ctx.services.db.permits.findPermitByNameOrId(guildId, permitInput);
      if (!permit) return ctx.reply(makeErrorCard("Not Found", `Permit **${permitInput}** does not exist.`));

      await ctx.services.db.permits.movePermit(guildId, permit.id, direction);
      const updated = await ctx.services.db.permits.getPermit(guildId, permit.id);

      return ctx.reply(
        makeSuccessCard(
          "Priority Reordered",
          `Moved **${permit.name}** ${direction === "up" ? "▲ UP" : "▼ DOWN"} to position **#${updated?.position}**.`,
        ),
      );
    }

    if (sub === "check") {
      const targetUser = (await ctx.getUser("user")) ?? ctx.user;
      const node = await ctx.getString("node");

      if (!node) return ctx.reply(makeErrorCard("Missing Node", "Specify the permit node to test (e.g. `mod.ban`)."));

      const targetMember = await ctx.guild?.members.fetch(targetUser.id).catch(() => null);

      const explanation = await evaluatePermit(ctx.services, {
        guildId,
        userId: targetUser.id,
        channelId: ctx.channel?.id ?? undefined,
        member: targetMember ?? undefined,
        guildOwnerId: ctx.guild?.ownerId ?? undefined,
        node,
      });

      const verdictEmoji = explanation.allowed ? "✅ ALLOWED" : "❌ DENIED";
      const tierLines = explanation.verdicts.map((v) => {
        const badge = v.verdict === "allow" ? "🟢 ALLOW" : v.verdict === "deny" ? "🔴 DENY" : "⚪ PASS";
        return `**${badge}** • \`${v.tier}\`${v.reason ? ` — *${v.reason}*` : ""}`;
      });

      const body = [
        `### Overall Verdict: ${verdictEmoji}`,
        `Testing rule: \`${node}\` for user ${userMention(targetUser.id)} (\`${targetUser.id}\`)\n`,
        `**Evaluation Trace (Top to Bottom):**\n${tierLines.join("\n")}`,
      ].join("\n");

      return ctx.reply(
        makeCard(
          explanation.allowed ? resolveCardColor("success") : resolveCardColor("error"),
          `Permit Check: ${node}`,
          body,
        ),
      );
    }

    return ctx.reply(makeErrorCard("Unknown Subcommand", `Unknown subcommand: ${sub}`));
  },
};
