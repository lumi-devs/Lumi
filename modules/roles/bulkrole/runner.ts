import type { ModuleServices } from "@lumi/module-kit";
import type { Guild, GuildMember } from "discord.js";
import {
  addMemberRoles,
  botMember,
  canBotManageGuildRole,
  removeMemberRoles,
} from "../shared.js";
import {
  type BulkCandidate,
  type BulkRoleAction,
  normalizeBulkFilter,
  selectBulkRoleChanges,
} from "./filter.js";
import { BulkRoleModuleName, getBulkRoleConfig } from "./config.js";
import {
  incrementBulkRoleJob,
  listRunnableBulkRoleJobs,
  type BulkRoleJob,
  updateBulkRoleJob,
} from "./store.js";
import { isRunnableJob, nextBatch, nextJobStatus } from "./worker-logic.js";

interface RunnerCandidate extends BulkCandidate {
  readonly member: GuildMember;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function processBulkRoleJobs(
  services: ModuleServices,
): Promise<number> {
  const jobs = await listRunnableBulkRoleJobs(services);
  let processed = 0;
  for (const job of jobs) {
    if (!isRunnableJob(job.status)) continue;
    await runBulkRoleJob(services, job);
    processed += 1;
  }
  return processed;
}

export async function runBulkRoleJob(
  services: ModuleServices,
  job: BulkRoleJob,
): Promise<void> {
  if (!isRunnableJob(job.status)) return;

  const guild = await resolveGuild(services, job.guildId);
  if (!guild) {
    await updateBulkRoleJob(services, job.id, {
      status: "failed",
      lastError: "Guild is not available",
    });
    return;
  }

  if (!services.modules.isEnabled(guild.id, BulkRoleModuleName)) {
    await updateBulkRoleJob(services, job.id, {
      status: "paused",
      lastError: "Bulk role module is disabled",
    });
    return;
  }

  const config = await getBulkRoleConfig(services, guild.id);
  if (!config.enabled) {
    await updateBulkRoleJob(services, job.id, {
      status: "paused",
      lastError: "Bulk role module is disabled",
    });
    return;
  }

  const role = await guild.roles.fetch(job.roleId).catch(() => null);
  if (!role) {
    await updateBulkRoleJob(services, job.id, {
      status: "failed",
      lastError: "Target role no longer exists",
    });
    return;
  }

  const bot = await botMember(guild);
  const hierarchy = canBotManageGuildRole(guild, bot, role);
  if (!hierarchy.allowed) {
    await updateBulkRoleJob(services, job.id, {
      status: "failed",
      lastError: hierarchy.reason,
    });
    return;
  }

  const action: BulkRoleAction = job.action === "remove" ? "remove" : "add";
  const filter = normalizeBulkFilter(job.filter);

  await updateBulkRoleJob(services, job.id, { status: "running" });

  let members: GuildMember[];
  try {
    const fetched = await guild.members.fetch();
    members = [...fetched.values()];
  } catch (error) {
    await updateBulkRoleJob(services, job.id, {
      status: "failed",
      lastError: `Member fetch failed: ${describeError(error)}`,
    });
    return;
  }

  const candidates: RunnerCandidate[] = members.map((member) => ({
    member,
    isBot: member.user.bot,
    roleIds: [...member.roles.cache.keys()],
    joinedAtMs: member.joinedTimestamp ?? 0,
  }));

  const changes = selectBulkRoleChanges(candidates, filter, action, job.roleId);
  const { batch, remaining } = nextBatch(changes, config.batchSize);

  let succeeded = 0;
  let failed = 0;
  for (const entry of batch) {
    const result =
      action === "add"
        ? await addMemberRoles(
            services,
            guild,
            entry.candidate.member,
            [job.roleId],
            "Bulk role add",
          )
        : await removeMemberRoles(
            services,
            guild,
            entry.candidate.member,
            [job.roleId],
            "Bulk role remove",
          );
    if (result.changed.length > 0) succeeded += 1;
    else failed += 1;
  }

  const failedTotal = job.failed + failed;
  const status = nextJobStatus({
    status: "running",
    remaining,
    failed: failedTotal,
    total: job.total,
  });
  await incrementBulkRoleJob(services, job.id, succeeded, failed, {
    status,
    lastError: failed > 0 ? `${failed} member(s) failed in this batch` : null,
  });
}

async function resolveGuild(
  services: ModuleServices,
  guildId: string,
): Promise<Guild | null> {
  const cached = services.client.guilds.cache.get(guildId);
  if (cached) return cached;
  return services.client.guilds.fetch(guildId).catch(() => null);
}
