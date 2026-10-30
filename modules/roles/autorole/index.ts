import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import { type GuildMember, type Role, SlashCommandBuilder } from "discord.js";
import {
  addMemberRoles,
  canManageRolesCommand,
  fetchMember,
  parseRoleIds,
  roleMentions,
} from "../shared.js";
import {
  AutoroleConfigSchema,
  AutoroleModuleName,
  getAutoroleConfig,
  saveAutoroleConfig,
} from "./config.js";
import { evaluateAutoroleCandidate, selectRolesToAssign } from "./logic.js";
import {
  cancelPendingAutoroles,
  countPendingAutoroles,
  enqueueAutorole,
  processPendingAutoroles,
} from "./store.js";

const PermitNode = "roles.autorole";

function knownRoles(
  guildRoles: Map<string, Role>,
  roleIds: string[],
): string[] {
  return roleIds.filter((roleId) => guildRoles.has(roleId));
}

function parseOptionalRoleIds(value: string | null): string[] | null {
  if (value === null) return null;
  return parseRoleIds(value);
}

const autoroleCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Configure join autoroles")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the roles assigned on join")
        .addStringOption((option) =>
          option
            .setName("roles")
            .setDescription(
              "Role mentions or IDs, separated by spaces or commas",
            )
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("delay")
            .setDescription("Delay in seconds before roles are assigned")
            .setMinValue(0)
            .setMaxValue(604800)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("filters")
        .setDescription("Set autorole eligibility filters")
        .addIntegerOption((option) =>
          option
            .setName("min_age_hours")
            .setDescription("Minimum account age in hours")
            .setMinValue(0)
            .setMaxValue(8760)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("required_roles")
            .setDescription(
              "Roles where the member needs at least one (mentions/IDs)",
            )
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("ignored_roles")
            .setDescription(
              "Roles that make a member ineligible (mentions/IDs)",
            )
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("ignore_bots")
            .setDescription("Skip bot accounts")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("only_on_join")
            .setDescription("Only apply from the join listener")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delay")
        .setDescription("Set the delay before roles are assigned")
        .addIntegerOption((option) =>
          option
            .setName("seconds")
            .setDescription("Delay in seconds, 0 for immediate")
            .setMinValue(0)
            .setMaxValue(604800)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("run")
        .setDescription("Process pending autoroles now, or queue one member")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Queue this member using the configured filters")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("resume").setDescription("Resume the pending autorole queue"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel pending autoroles")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Only cancel this member's pending autoroles")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Show autorole configuration and queue"),
    ),
  requiredPermit: PermitNode,
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Autorole runs per server."),
        ),
      );
      return;
    }
    if (!(await canManageRolesCommand(interaction, services, PermitNode))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "You need **Manage Server** or the `roles.autorole` permit.",
          ),
        ),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const config = await getAutoroleConfig(services, guild.id);

    if (subcommand === "set") {
      const roleIds = knownRoles(
        guild.roles.cache,
        parseRoleIds(interaction.options.getString("roles", true)),
      );
      if (roleIds.length === 0) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "No Valid Roles",
              "Provide at least one role mention or role ID from this server.",
            ),
          ),
        );
        return;
      }
      const delay = interaction.options.getInteger("delay");
      const next = {
        ...config,
        roleIds,
        ...(delay === null ? {} : { delaySeconds: delay }),
      };
      if (!(await saveAutoroleConfig(services, guild.id, next))) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Save Failed", "Could not save autorole settings."),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Autoroles Updated", [
            `**Roles**\n${roleMentions(roleIds)}`,
            `**Delay**\n${next.delaySeconds}s`,
          ]),
        ),
      );
      return;
    }

    if (subcommand === "filters") {
      const required = parseOptionalRoleIds(
        interaction.options.getString("required_roles"),
      );
      const ignored = parseOptionalRoleIds(
        interaction.options.getString("ignored_roles"),
      );
      const minAge = interaction.options.getInteger("min_age_hours");
      const ignoreBots = interaction.options.getBoolean("ignore_bots");
      const onlyOnJoin = interaction.options.getBoolean("only_on_join");
      const next = {
        ...config,
        ...(required === null
          ? {}
          : { requiredRoleIds: knownRoles(guild.roles.cache, required) }),
        ...(ignored === null
          ? {}
          : { ignoredRoleIds: knownRoles(guild.roles.cache, ignored) }),
        ...(minAge === null ? {} : { minAccountAgeHours: minAge }),
        ...(ignoreBots === null ? {} : { ignoreBots }),
        ...(onlyOnJoin === null ? {} : { onlyOnJoin }),
      };
      if (!(await saveAutoroleConfig(services, guild.id, next))) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Save Failed", "Could not save autorole filters."),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Autorole Filters Updated", [
            `**Minimum account age**\n${next.minAccountAgeHours}h`,
            `**Required roles**\n${roleMentions(next.requiredRoleIds)}`,
            `**Ignored roles**\n${roleMentions(next.ignoredRoleIds)}`,
            `**Ignore bots**\n${next.ignoreBots ? "Yes" : "No"}`,
            `**Only on join**\n${next.onlyOnJoin ? "Yes" : "No"}`,
          ]),
        ),
      );
      return;
    }

    if (subcommand === "delay") {
      const seconds = interaction.options.getInteger("seconds", true);
      if (
        !(await saveAutoroleConfig(services, guild.id, {
          ...config,
          delaySeconds: seconds,
        }))
      ) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Save Failed", "Could not save the autorole delay."),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Autorole Delay Updated",
            `New members receive roles after **${seconds}s**.`,
          ),
        ),
      );
      return;
    }

    if (subcommand === "run") {
      const target = interaction.options.getUser("user");
      if (target) {
        const member = await fetchMember(guild, target.id);
        if (!member) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Member Not Found",
                "That member is not in this server.",
              ),
            ),
          );
          return;
        }
        const decision = evaluateAutoroleCandidate(
          {
            isBot: member.user.bot,
            accountAgeMs: Date.now() - member.user.createdTimestamp,
            roleIds: [...member.roles.cache.keys()],
            isJoin: false,
          },
          config,
        );
        if (!decision.eligible) {
          await interaction.reply(
            ephemeralCard(makeWarningCard("Not Eligible", decision.reason)),
          );
          return;
        }
        const roleIds = selectRolesToAssign(config.roleIds, [
          ...member.roles.cache.keys(),
        ]);
        await enqueueAutorole(services, {
          guildId: guild.id,
          userId: member.id,
          roleIds,
          delaySeconds: 0,
        });
      }
      const result = await processPendingAutoroles(services, {
        guildId: guild.id,
        ...(target ? { userId: target.id } : {}),
        force: true,
      });
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Autorole Queue Processed", [
            `**Completed**\n${result.processed}`,
            `**Failed**\n${result.failed}`,
          ]),
        ),
      );
      return;
    }

    if (subcommand === "resume") {
      if (
        !(await saveAutoroleConfig(services, guild.id, {
          ...config,
          paused: false,
        }))
      ) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Save Failed", "Could not resume the queue."),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Autorole Resumed",
            "Pending autoroles will be processed on the next minute tick.",
          ),
        ),
      );
      return;
    }

    if (subcommand === "cancel") {
      const target = interaction.options.getUser("user");
      const cancelled = await cancelPendingAutoroles(
        services,
        guild.id,
        target?.id,
      );
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Autorole Queue Cancelled", [
            `**Cancelled**\n${cancelled} pending ${cancelled === 1 ? "entry" : "entries"}`,
            ...(target ? [`**Member**\n<@${target.id}>`] : []),
          ]),
        ),
      );
      return;
    }

    const pending = await countPendingAutoroles(services, guild.id);
    await interaction.reply(
      ephemeralCard(
        makeInfoCard("🚪 Autorole", [
          `**Status**\n${config.enabled ? "Enabled" : "Disabled"}${config.paused ? " · Paused" : ""}`,
          `**Roles**\n${roleMentions(config.roleIds)}`,
          `**Delay**\n${config.delaySeconds}s`,
          `**Minimum account age**\n${config.minAccountAgeHours}h`,
          `**Required roles**\n${roleMentions(config.requiredRoleIds)}`,
          `**Ignored roles**\n${roleMentions(config.ignoredRoleIds)}`,
          `**Ignore bots**\n${config.ignoreBots ? "Yes" : "No"}`,
          `**Only on join**\n${config.onlyOnJoin ? "Yes" : "No"}`,
          `**Pending**\n${pending}`,
        ]),
      ),
    );
  },
};

const onMemberAddListener: ListenerDefinition = {
  event: "guildMemberAdd",
  async handler(member: GuildMember, services: ModuleServices) {
    const guild = member.guild;
    if (!services.modules.isEnabled(guild.id, AutoroleModuleName)) return;
    const config = await getAutoroleConfig(services, guild.id);
    const decision = evaluateAutoroleCandidate(
      {
        isBot: member.user.bot,
        accountAgeMs: Date.now() - member.user.createdTimestamp,
        roleIds: [...member.roles.cache.keys()],
        isJoin: true,
      },
      config,
    );
    if (!decision.eligible) return;

    const roleIds = selectRolesToAssign(config.roleIds, [
      ...member.roles.cache.keys(),
    ]);
    if (roleIds.length === 0) return;

    if (config.delaySeconds === 0) {
      await addMemberRoles(services, guild, member, roleIds, "Autorole");
      return;
    }

    await enqueueAutorole(services, {
      guildId: guild.id,
      userId: member.id,
      roleIds,
      delaySeconds: config.delaySeconds,
    });
  },
};

const autoroleModule: ModuleDefinition = defineModule({
  name: AutoroleModuleName,
  displayName: "Autorole",
  emoji: "🚪",
  description:
    "Multi-role autorole on join with filters, optional delay, and a durable pending queue",
  version: "2.0.0",
  config: AutoroleConfigSchema,
  commands: [autoroleCommand],
  listeners: [onMemberAddListener],
  tasks: [
    {
      name: "pending",
      cron: "*/1 * * * *",
      async handler(services: ModuleServices) {
        await processPendingAutoroles(services, {});
      },
    },
  ],
  async onLoad(_services) {
    console.log(`[${AutoroleModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${AutoroleModuleName}] Module unloaded`);
  },
});

export default autoroleModule;
