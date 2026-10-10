import { defineUtility } from "@lumi/lib/module-system/utility.js";
import { type Container } from "@lumi/lib/services.js";
import { AsyncQueue } from "@sapphire/async-queue";
import {
  ChannelType,
  Collection,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { Routes } from "discord-api-types/v10";
import { errorCode, logError } from "@lumi/lib/utilities/errors.js";
import { renderTemplate } from "@lumi/lib/utilities/template.js";
import { scheduleTask, QueuePriority } from "@lumi/lib/scheduler/schedule.js";
import { claimCooldown } from "@lumi/lib/valkey/cooldown.js";
import {
  clearVoiceChannelOccupancy,
  isVoiceChannelEmpty,
} from "@lumi/application/services/tempvc/voice-occupancy.js";
import { TempvcCleanupDelayMs, ModuleName, TempVcKeys } from "../constants.js";
import { getCreateCooldownMs, getMaxGenerators } from "../config.js";
import {
  getVcRecord,
  listVcRecords,
  removeVcRecord,
  setVcRecord,
  patchVcRecord,
  listGenerators,
  setGenerator,
  removeGenerator,
  type GeneratorConfig,
  type VcRecord,
} from "../data/tempvc.js";
import { tempVcRegistry } from "@lumi/application/services/tempvc/registry.js";
import { buildPanel } from "../ui/panel.js";

const creationQueues = new Collection<string, AsyncQueue>();

const cleanupJobId = (guildId: string, channelId: string) =>
  `tempvc-cleanup-${guildId}-${channelId}`;

/**
 * Resolves a generator's name template into a channel name.
 * Supports `{}`/`{number}` (sequence number, kept both for backwards
 * compatibility), `{username}` (raw account username), `{name}`/`{nickname}`
 * (display name), and `{position}` (alias of `{number}`). Falls back to
 * appending the number when no placeholder is present. Truncated to
 * Discord's 100-character channel name limit after all substitutions.
 */
export function resolveGeneratorName(
  template: string,
  { number, member }: { number: number; member: GuildMember },
): string {
  const trimmed = template.trim();
  const hasPlaceholder =
    /\{\}|\{number\}|\{position\}|\{username\}|\{name\}|\{nickname\}/.test(
      trimmed,
    );
  const substituted = hasPlaceholder
    ? renderTemplate(trimmed.replaceAll("{}", "{number}"), {
        number: String(number),
        position: String(number),
        username: member.user.username,
        name: member.displayName,
        nickname: member.displayName,
      })
    : `${trimmed} ${number}`;
  return [...substituted].slice(0, 100).join("");
}

async function reorderChannels(
  services: Container,
  guild: Guild,
  categoryId: string,
): Promise<void> {
  try {
    const categoryChannels = [...guild.channels.cache.values()].filter(
      (c) => c.parentId === categoryId && c.isVoiceBased(),
    ) as VoiceBasedChannel[];

    if (categoryChannels.length === 0) return;

    const [recordsMap, generatorsMap] = await Promise.all([
      listVcRecords(services, guild.id),
      listGenerators(services, guild.id),
    ]);

    const generators: VoiceBasedChannel[] = [];
    const managedVcs: VoiceBasedChannel[] = [];
    const staticVcs: VoiceBasedChannel[] = [];

    for (const channel of categoryChannels) {
      if (generatorsMap.has(channel.id)) {
        generators.push(channel);
      } else if (recordsMap.has(channel.id)) {
        managedVcs.push(channel);
      } else {
        staticVcs.push(channel);
      }
    }

    generators.sort((a, b) => a.position - b.position);
    staticVcs.sort((a, b) => a.position - b.position);

    const genPosition = new Map<string, number>();
    generators.forEach((g, i) => genPosition.set(g.id, i));

    managedVcs.sort((a, b) => {
      const recA = recordsMap.get(a.id);
      const recB = recordsMap.get(b.id);
      if (!recA || !recB) return 0;

      const posA =
        genPosition.get(recA.generatorId) ?? Number.MAX_SAFE_INTEGER;
      const posB =
        genPosition.get(recB.generatorId) ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;

      return recA.number - recB.number;
    });

    const finalOrder = [...generators, ...managedVcs, ...staticVcs];
    const positions = finalOrder.map((c, index) => ({
      channel: c.id,
      position: index,
    }));

    const needsReorder = finalOrder.some((c, index) => c.position !== index);
    if (needsReorder) {
      await guild.channels.setPositions(positions);
    }
  } catch (err: unknown) {
    logError("TempVC: reorder channels failed", err);
  }
}

async function scheduleCleanup(
  guildId: string,
  channelId: string,
): Promise<void> {
  await scheduleTask(
    "tempvc-cleanup",
    { guildId, channelId },
    {
      repeated: false,
      delay: TempvcCleanupDelayMs,
      customJobOptions: {
        jobId: cleanupJobId(guildId, channelId),
        removeOnComplete: true,
        removeOnFail: true,
        priority: QueuePriority.CLEANUP,
      },
    },
  ).catch((err: unknown) => logError("TempVC: schedule cleanup failed", err));
}

async function setRestriction(
  services: Container,
  channel: VoiceBasedChannel,
  record: VcRecord,
  permission: "Connect" | "ViewChannel",
  active: boolean,
  patch: Partial<VcRecord>,
): Promise<VcRecord> {
  const { everyone } = channel.guild.roles;
  await channel.permissionOverwrites.edit(everyone, {
    [permission]: active ? false : null,
  });
  if (active) {
    for (const m of channel.members.values()) {
      await channel.permissionOverwrites
        .edit(m.id, { [permission]: true })
        .catch(() => null);
    }
  }
  const next = await patchVcRecord(services, channel.guild.id, channel.id, patch);
  return next ?? { ...record, ...patch };
}

const tempVcUtility = defineUtility({
  name: "tempvc",

  reorderChannels,
  scheduleCleanup,

  async onCreateCooldown(
    services: Container,
    guildId: string,
    userId: string,
  ): Promise<boolean> {
    const cooldownMs = await getCreateCooldownMs(services, guildId);
    return !(await claimCooldown(
      services,
      TempVcKeys.createCooldown(guildId, userId),
      cooldownMs,
    ));
  },

  async createVc(
    services: Container,
    member: GuildMember,
    generator: VoiceBasedChannel,
    config: GeneratorConfig,
  ): Promise<void> {
    let queue = creationQueues.get(generator.id);
    if (!queue) {
      queue = new AsyncQueue();
      creationQueues.set(generator.id, queue);
    }
    await queue.wait();

    try {
      const { guild } = member;
      const number = await tempVcRegistry.nextNumber(
        guild.id,
        generator.id,
        (id) => guild.channels.cache.has(id),
      );
      const name = resolveGeneratorName(config.name, { number, member });

      const vc = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: generator.parentId ?? undefined,
        userLimit: config.limit > 0 ? config.limit : undefined,
        reason: `Temp VC created by ${member.user.tag}`,
      });

      const moved = await member.voice
        .setChannel(vc)
        .then(() => true)
        .catch(() => false);
      if (!moved) {
        await vc.delete("Temp VC owner left before move").catch(() => null);
        return;
      }

      const record: VcRecord = {
        ownerId: member.id,
        generatorId: generator.id,
        name,
        number,
        locked: false,
        hidden: false,
        createdAt: Date.now(),
      };
      try {
        await setVcRecord(services, guild.id, vc.id, record);
      } catch (err: unknown) {
        await vc.delete("Temp VC record write failed").catch(() => null);
        throw err;
      }

      if (generator.parentId) {
        const { parentId } = generator;
        setTimeout(() => {
          void reorderChannels(services, guild, parentId).catch((err: unknown) => {
            logError("TempVC: reorder channels failed", err);
          });
        }, 1000);
      }

      void buildPanel(services, vc, record)
        .then((panel) => vc.send(panel))
        .catch((err: unknown) => {
          logError("TempVC: panel send failed", err);
        });
    } finally {
      queue.shift();
      if (queue.remaining === 0) creationQueues.delete(generator.id);
    }
  },

  async runCleanup(services: Container, data: {
    guildId: string;
    channelId: string;
  }): Promise<void> {
    const { guildId, channelId } = data;
    const record = await getVcRecord(services, guildId, channelId);
    if (!record) return;

    if (!(await isVoiceChannelEmpty(channelId))) return;

    const cleanup = async () => {
      await removeVcRecord(services, guildId, channelId);
      await clearVoiceChannelOccupancy(channelId);
    };

    try {
      await services.client.rest.delete(Routes.channel(channelId), {
        reason: "Empty temp VC cleanup",
      });
      await cleanup();
    } catch (err: unknown) {
      const code = errorCode(err);
      if (code === 10003 || code === 50013) {
        await cleanup();
        return;
      }
      throw err;
    }
  },

  async reconcileGuild(services: Container, guild: Guild): Promise<void> {
    const records = await listVcRecords(services, guild.id);
    for (const [channelId] of records) {
      if (!guild.channels.cache.has(channelId)) {
        await removeVcRecord(services, guild.id, channelId).catch((err: unknown) => {
          logError("TempVC: reconcile orphaned record removal failed", err);
        });
        continue;
      }
      await scheduleCleanup(guild.id, channelId);
    }
  },

  setLock(
    services: Container,
    channel: VoiceBasedChannel,
    record: VcRecord,
    locked: boolean,
  ): Promise<VcRecord> {
    return setRestriction(services, channel, record, "Connect", locked, { locked });
  },

  setHide(
    services: Container,
    channel: VoiceBasedChannel,
    record: VcRecord,
    hidden: boolean,
  ): Promise<VcRecord> {
    return setRestriction(services, channel, record, "ViewChannel", hidden, {
      hidden,
    });
  },

  async setOwner(
    services: Container,
    channel: VoiceBasedChannel,
    record: VcRecord,
    newOwnerId: string,
  ): Promise<VcRecord> {
    if (channel.permissionOverwrites.cache.has(record.ownerId)) {
      await channel.permissionOverwrites
        .edit(record.ownerId, { ManageChannels: null })
        .catch(() => null);
    }
    await channel.permissionOverwrites
      .edit(newOwnerId, { ManageChannels: true })
      .catch(() => null);
    const next = await patchVcRecord(services, channel.guild.id, channel.id, {
      ownerId: newOwnerId,
    });
    return next ?? { ...record, ownerId: newOwnerId };
  },

  canManage(member: GuildMember, channel: VoiceBasedChannel): boolean {
    return channel
      .permissionsFor(member)
      .has(PermissionFlagsBits.ManageChannels);
  },

  get moduleName() {
    return ModuleName;
  },

  async addGenerator(
    services: Container,
    guildId: string,
    channelId: string,
    config: GeneratorConfig,
  ): Promise<void> {
    const generators = await listGenerators(services, guildId);
    if (!generators.has(channelId)) {
      const maxGenerators = await getMaxGenerators(services, guildId);
      if (generators.size >= maxGenerators) {
        throw new Error(
          `This server already has the maximum of ${maxGenerators} voice generators.`,
        );
      }
    }
    await setGenerator(services, guildId, channelId, config);
  },

  async removeGenerator(
    services: Container,
    guildId: string,
    channelId: string,
  ): Promise<boolean> {
    return removeGenerator(services, guildId, channelId);
  },

  async listGenerators(
    services: Container,
    guildId: string,
  ): Promise<Map<string, GeneratorConfig>> {
    return listGenerators(services, guildId);
  }

});

export default tempVcUtility;

export type TempVcUtility = typeof tempVcUtility;

declare module "@lumi/lib/module-system/utility.js" {
  interface Utilities {
    tempvc: typeof tempVcUtility;
  }
}
