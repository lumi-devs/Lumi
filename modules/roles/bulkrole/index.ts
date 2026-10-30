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
import { type GuildMember, SlashCommandBuilder } from "discord.js";
import {
  botMember,
  canBotManageGuildRole,
  canManageRolesCommand,
  parseRoleIds,
  roleMentions,
} from "../shared.js";
import { BulkRoleConfigSchema, BulkRoleModuleName } from "./config.js";
import {
  type BulkCandidate,
  type BulkRoleAction,
  type BulkRoleFilter,
  type BulkRoleFilterMode,
  countBulkMatches,
  countBulkRoleChanges,
  parseFilterDate,
  selectBulkMatches,
} from "./filter.js";
import { processBulkRoleJobs } from "./runner.js";
import {
  createBulkRoleJob,
  getBulkRoleJob,
  type BulkRoleJob,
  listGuildBulkRoleJobs,
  setBulkRoleJobStatus,
} from "./store.js";
import {
  cancelJobStatus,
  isTerminalJob,
  progressBar,
  progressPercent,
  resumeJobStatus,
} from "./worker-logic.js";

const PermitNode = "roles.bulkrole";

interface CandidateSnapshot extends BulkCandidate {
  readonly member: GuildMember;
}

function jobSummary(job: BulkRoleJob): string {
  return `\`${job.id}\` · ${job.action} <@&${job.roleId}> · **${job.status}** · ${job.processed}/${job.total} (${job.failed} failed)`;
}

function jobCard(job: BulkRoleJob) {
  return makeInfoCard("🧰 Bulk Role Job", [
    `**Job**\n\`${job.id}\``,
    `**Action**\n${job.action === "remove" ? "Remove" : "Add"} ${roleMentions([job.roleId])}`,
    `**Status**\n${job.status}`,
    `**Progress**\n${progressBar(job, 16)} ${progressPercent(job)}%`,
    `**Processed**\n${job.processed} / ${job.total}`,
    `**Failed**\n${job.failed}`,
    ...(job.lastError ? [`**Last error**\n${job.lastError}`] : []),
  ]);
}

async function snapshotMembers(
  services: ModuleServices,
  guildId: string,
): Promise<CandidateSnapshot[] | null> {
  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return null;
  const fetched = await guild.members.fetch().catch(() => null);
  if (!fetched) return null;
  return [...fetched.values()].map((member) => ({
    member,
    isBot: member.user.bot,
    roleIds: [...member.roles.cache.keys()],
    joinedAtMs: member.joinedTimestamp ?? 0,
  }));
}

function buildFilter(
  mode: BulkRoleFilterMode,
  roleIds: string[],
  before: string | null,
  after: string | null,
): BulkRoleFilter | string {
  if (mode === "has_roles" || mode === "missing_roles") {
    if (roleIds.length === 0) {
      return "Provide at least one role ID in `filter_roles` for this filter.";
    }
  }
  if (mode === "joined_before" && parseFilterDate(before) === null) {
    return "Provide a valid ISO date in `before` for the joined_before filter.";
  }
  if (mode === "joined_after" && parseFilterDate(after) === null) {
    return "Provide a valid ISO date in `after` for the joined_after filter.";
  }
  return { mode, roleIds, before, after };
}

const bulkRoleCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("bulkrole")
    .setDescription("Run resumable bulk role jobs")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a bulk role job, or preview it with dry run")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to add or remove")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Add or remove the role")
            .setRequired(true)
            .addChoices(
              { name: "Add", value: "add" },
              { name: "Remove", value: "remove" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("filter")
            .setDescription("Member filter")
            .setRequired(true)
            .addChoices(
              { name: "All members", value: "all" },
              { name: "Has any listed role", value: "has_roles" },
              { name: "Missing all listed roles", value: "missing_roles" },
              { name: "Joined before date", value: "joined_before" },
              { name: "Joined after date", value: "joined_after" },
              { name: "Only humans", value: "only_humans" },
              { name: "Only bots", value: "only_bots" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("filter_roles")
            .setDescription("Role mentions or IDs for has_roles/missing_roles")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("before")
            .setDescription("ISO date for joined_before")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("after")
            .setDescription("ISO date for joined_after")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("dry_run")
            .setDescription("Preview counts without changing roles")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Show a job or the latest jobs")
        .addStringOption((option) =>
          option.setName("job").setDescription("Job ID").setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("progress")
        .setDescription("Show progress for a job or the latest jobs")
        .addStringOption((option) =>
          option.setName("job").setDescription("Job ID").setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel a pending or paused job")
        .addStringOption((option) =>
          option.setName("job").setDescription("Job ID").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("pause")
        .setDescription("Pause a pending or running job")
        .addStringOption((option) =>
          option.setName("job").setDescription("Job ID").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("resume")
        .setDescription("Resume a paused job")
        .addStringOption((option) =>
          option.setName("job").setDescription("Job ID").setRequired(true),
        ),
    ),
  requiredPermit: PermitNode,
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Bulk role jobs run per server."),
        ),
      );
      return;
    }
    if (!(await canManageRolesCommand(interaction, services, PermitNode))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "You need **Manage Server** or the `roles.bulkrole` permit.",
          ),
        ),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "start") {
      const role = interaction.options.getRole("role", true);
      const action = interaction.options.getString(
        "action",
        true,
      ) as BulkRoleAction;
      const mode = interaction.options.getString(
        "filter",
        true,
      ) as BulkRoleFilterMode;
      const filterRoles = parseRoleIds(
        interaction.options.getString("filter_roles"),
      );
      const before = interaction.options.getString("before");
      const after = interaction.options.getString("after");
      const dryRun = interaction.options.getBoolean("dry_run") ?? true;
      const built = buildFilter(mode, filterRoles, before, after);
      if (typeof built === "string") {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Invalid Filter", built)),
        );
        return;
      }

      const bot = await botMember(guild);
      const guildRole = guild.roles.cache.get(role.id);
      if (!guildRole) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Role Not Found", "That role is not in this server."),
          ),
        );
        return;
      }
      const hierarchy = canBotManageGuildRole(guild, bot, guildRole);
      if (!hierarchy.allowed && !dryRun) {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Cannot Manage Role", hierarchy.reason)),
        );
        return;
      }

      const candidates = await snapshotMembers(services, guild.id);
      if (!candidates) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Member Fetch Failed",
              "Could not fetch the member list for this server.",
            ),
          ),
        );
        return;
      }

      const matched = countBulkMatches(candidates, built);
      const changes = countBulkRoleChanges(candidates, built, action, role.id);

      if (dryRun) {
        const samples = selectBulkMatches(candidates, built)
          .slice(0, 5)
          .map((candidate) => `<@${candidate.member.id}>`);
        await interaction.reply(
          ephemeralCard(
            makeInfoCard("🧰 Bulk Role Dry Run", [
              `**Action**\n${action === "remove" ? "Remove" : "Add"} ${roleMentions([role.id])}`,
              `**Filter**\n${built.mode}`,
              `**Matched members**\n${matched}`,
              `**Members needing a change**\n${changes}`,
              ...(samples.length > 0
                ? [`**Sample**\n${samples.join(", ")}`]
                : []),
              "No roles were changed.",
            ]),
          ),
        );
        return;
      }

      if (changes === 0) {
        await interaction.reply(
          ephemeralCard(
            makeWarningCard(
              "Nothing To Do",
              "No members match the filter or already have the requested role state.",
            ),
          ),
        );
        return;
      }

      const job = await createBulkRoleJob(services, {
        guildId: guild.id,
        roleId: role.id,
        action,
        filter: built,
        total: changes,
        createdBy: interaction.user.id,
      });
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Bulk Role Job Started", [
            `**Job**\n\`${job.id}\``,
            `**Action**\n${action === "remove" ? "Remove" : "Add"} ${roleMentions([role.id])}`,
            `**Filter**\n${built.mode}`,
            `**Members**\n${changes}`,
            "The worker processes a batch every minute. Use `/bulkrole progress` to follow it.",
          ]),
        ),
      );
      return;
    }

    if (subcommand === "status" || subcommand === "progress") {
      const jobId = interaction.options.getString("job");
      if (jobId) {
        const job = await getBulkRoleJob(services, guild.id, jobId);
        if (!job) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Job Not Found",
                "No job with that ID exists here.",
              ),
            ),
          );
          return;
        }
        await interaction.reply(ephemeralCard(jobCard(job)));
        return;
      }
      const jobs = await listGuildBulkRoleJobs(services, guild.id);
      if (jobs.length === 0) {
        await interaction.reply(
          ephemeralCard(
            makeInfoCard(
              "🧰 Bulk Role Jobs",
              "No bulk role jobs have been started in this server.",
            ),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(
          makeInfoCard(
            "🧰 Bulk Role Jobs",
            jobs.map((job) => jobSummary(job)),
          ),
        ),
      );
      return;
    }

    const jobId = interaction.options.getString("job", true);
    const job = await getBulkRoleJob(services, guild.id, jobId);
    if (!job) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Job Not Found", "No job with that ID exists here."),
        ),
      );
      return;
    }

    if (subcommand === "cancel") {
      const status = cancelJobStatus(job.status);
      if (status === job.status && isTerminalJob(job.status)) {
        await interaction.reply(
          ephemeralCard(
            makeWarningCard(
              "Already Finished",
              `Job \`${job.id}\` is already **${job.status}**.`,
            ),
          ),
        );
        return;
      }
      await setBulkRoleJobStatus(services, guild.id, job.id, status);
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Bulk Role Job Cancelled",
            `Job \`${job.id}\` is now **${status}**.`,
          ),
        ),
      );
      return;
    }

    if (subcommand === "pause") {
      if (isTerminalJob(job.status)) {
        await interaction.reply(
          ephemeralCard(
            makeWarningCard(
              "Already Finished",
              `Job \`${job.id}\` is already **${job.status}**.`,
            ),
          ),
        );
        return;
      }
      await setBulkRoleJobStatus(services, guild.id, job.id, "paused");
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Bulk Role Job Paused",
            `Job \`${job.id}\` is paused.`,
          ),
        ),
      );
      return;
    }

    const status = resumeJobStatus(job.status);
    if (status === job.status) {
      await interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Cannot Resume",
            `Job \`${job.id}\` is **${job.status}** and cannot be resumed.`,
          ),
        ),
      );
      return;
    }
    await setBulkRoleJobStatus(services, guild.id, job.id, status);
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard(
          "Bulk Role Job Resumed",
          `Job \`${job.id}\` will continue on the next minute tick.`,
        ),
      ),
    );
  },
};

const workerListener: ListenerDefinition = {
  event: "ready",
  async handler(services: ModuleServices) {
    void processBulkRoleJobs(services).catch((error) =>
      services.observability?.logger?.warn?.(
        "[roles-bulkrole] initial worker run failed",
        { error },
      ),
    );
  },
};

const bulkRoleModule: ModuleDefinition = defineModule({
  name: BulkRoleModuleName,
  displayName: "Bulk Role",
  emoji: "🧰",
  description:
    "Durable bulk add or remove role jobs with filters, dry-run previews, and resumable progress",
  version: "2.0.0",
  config: BulkRoleConfigSchema,
  commands: [bulkRoleCommand],
  listeners: [workerListener],
  tasks: [
    {
      name: "worker",
      cron: "*/1 * * * *",
      async handler(services: ModuleServices) {
        await processBulkRoleJobs(services);
      },
    },
  ],
  async onLoad(_services) {
    console.log(`[${BulkRoleModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${BulkRoleModuleName}] Module unloaded`);
  },
});

export default bulkRoleModule;
