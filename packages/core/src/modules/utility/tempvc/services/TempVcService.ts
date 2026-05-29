import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { AsyncQueue } from "@sapphire/async-queue";
import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { Routes } from "discord-api-types/v10";
import { errorCode, logError } from "#utilities/errors.js";
import { scheduleTask } from "#lib/schedule-task.js";
import {
  clearVoiceChannelOccupancy,
  isVoiceChannelEmpty,
} from "../lib/voice-occupancy.js";
import {
  TEMPVC_CLEANUP_DELAY_MS,
  TEMPVC_CREATE_COOLDOWN_MS,
} from "../index.js";
import { MODULE_NAME, TempVcKeys } from "../keys.js";
import {
  getVcRecord,
  listVcRecords,
  removeVcRecord,
  setVcRecord,
  listGenerators,
  type GeneratorConfig,
  type VcRecord,
} from "../data.js";
import { tempVcRegistry } from "../registry.js";
import { buildPanel } from "../ui/panel.js";

const creationQueues = new Map<string, AsyncQueue>();

const cleanupJobId = (guildId: string, channelId: string) =>
  `tempvc-cleanup:${guildId}:${channelId}`;

@ApplyOptions<Piece.Options>({ name: "tempvc" })
export default class TempVcService extends Service {
  /** True if this user must wait before creating another channel. */
  public async onCreateCooldown(
    guildId: string,
    userId: string,
  ): Promise<boolean> {
    const set = await this.redis.set(
      TempVcKeys.createCooldown(guildId, userId),
      "1",
      "PX",
      TEMPVC_CREATE_COOLDOWN_MS,
      "NX",
    );
    return set === null;
  }

  /**
   * Creates a temp VC for `member` from a generator channel, moves them in, and
   * posts the control panel. Numbering is serialized per-generator to avoid
   * duplicate names under concurrent joins.
   */
  public async createVc(
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
      const template = config.name.trim();
      const name = (
        template.includes("{}")
          ? template.replace("{}", String(number))
          : `${template} ${number}`
      ).slice(0, 100);

      const vc = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: generator.parentId ?? undefined,
        userLimit: config.limit > 0 ? config.limit : undefined,
        reason: `Temp VC created by ${member.user.tag}`,
      });

      await member.voice.setChannel(vc).catch(() => null);

      const record: VcRecord = {
        ownerId: member.id,
        generatorId: generator.id,
        name,
        number,
        locked: false,
        hidden: false,
        createdAt: Date.now(),
      };
      await setVcRecord(guild.id, vc.id, record);

      if (generator.parentId) {
        const { parentId } = generator;
        setTimeout(() => {
          void this.reorderChannels(guild, parentId).catch((err: unknown) => {
            logError("TempVC: reorder channels failed", err);
          });
        }, 1000);
      }

      void vc.send(buildPanel(vc, record)).catch((err: unknown) => {
        logError("TempVC: panel send failed", err);
      });
    } finally {
      queue.shift();
      if (queue.remaining === 0) creationQueues.delete(generator.id);
    }
  }

  /**
   * Sorts voice channels in the category to group generators first, managed
   * channels next (sorted by Duo/Trio/Squad/Other, then by number), and static
   * channels last.
   */
  public async reorderChannels(
    guild: Guild,
    categoryId: string,
  ): Promise<void> {
    try {
      const categoryChannels = [...guild.channels.cache.values()].filter(
        (c) => c.parentId === categoryId && c.isVoiceBased(),
      ) as VoiceBasedChannel[];

      if (categoryChannels.length === 0) return;

      const [recordsMap, generatorsMap] = await Promise.all([
        listVcRecords(guild.id),
        listGenerators(guild.id),
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

      const getVcType = (name: string): string => {
        const clean = name.trim().toLowerCase();
        if (/\bduo\b/.test(clean)) return "Duo";
        if (/\btrio\b/.test(clean)) return "Trio";
        if (/\bsquad\b/.test(clean)) return "Squad";
        return "Other";
      };

      const typeOrder: Record<string, number> = {
        Duo: 1,
        Trio: 2,
        Squad: 3,
        Other: 4,
      };

      managedVcs.sort((a, b) => {
        const recA = recordsMap.get(a.id);
        const recB = recordsMap.get(b.id);
        if (!recA || !recB) return 0;

        const genA = recA.generatorId
          ? generatorsMap.get(recA.generatorId)
          : null;
        const genB = recB.generatorId
          ? generatorsMap.get(recB.generatorId)
          : null;

        const typeA = getVcType(genA?.name ?? recA.name);
        const typeB = getVcType(genB?.name ?? recB.name);

        const orderA = typeOrder[typeA] ?? 4;
        const orderB = typeOrder[typeB] ?? 4;

        if (orderA !== orderB) {
          return orderA - orderB;
        }
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

  /**
   * Debounced empty-channel cleanup via the persisted (Redis-backed) task queue.
   * Keyed by channel so re-scheduling is idempotent and the job survives restarts.
   */
  public async scheduleCleanup(
    guildId: string,
    channelId: string,
  ): Promise<void> {
    await scheduleTask(
      "tempvc-cleanup",
      { guildId, channelId },
      {
        repeated: false,
        delay: TEMPVC_CLEANUP_DELAY_MS,
        customJobOptions: {
          jobId: cleanupJobId(guildId, channelId),
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    ).catch((err: unknown) => logError("TempVC: schedule cleanup failed", err));
  }

  /**
   * Job handler: delete the channel if it's empty (per the Redis voice-state
   * projection) via REST. The voice-state cache is disabled, so we don't read
   * `channel.members.size`; instead we trust the projection maintained by
   * `lib/voice-occupancy` and let Discord be authoritative for channel existence
   * (404 from DELETE = already gone = drop the record).
   */
  public async runCleanup(data: {
    guildId: string;
    channelId: string;
  }): Promise<void> {
    const { guildId, channelId } = data;
    const record = await getVcRecord(guildId, channelId);
    if (!record) return;

    if (!(await isVoiceChannelEmpty(channelId))) return;

    try {
      await this.container.client.rest.delete(Routes.channel(channelId), {
        reason: "Empty temp VC cleanup",
      });
      await removeVcRecord(guildId, channelId);
      await clearVoiceChannelOccupancy(channelId);
    } catch (err: unknown) {
      const code = errorCode(err);
      // 10003 Unknown Channel — already deleted out from under us. 50013 Missing
      // Permissions — we can't touch it; drop the record so we stop trying.
      if (code === 10003 || code === 50013) {
        await removeVcRecord(guildId, channelId);
        await clearVoiceChannelOccupancy(channelId);
        return;
      }
      throw err;
    }
  }

  /**
   * Boot-time reconciliation. Schedules a cleanup for every persisted record;
   * the cleanup task itself reconciles state (REST 404 → drop record, empty →
   * delete + drop record, occupied → no-op). The 8s cleanup delay gives the
   * GUILD_CREATE voice-state seed time to land before the empty check runs.
   */
  public async reconcileGuild(guild: Guild): Promise<void> {
    const records = await listVcRecords(guild.id);
    for (const [channelId] of records) {
      await this.scheduleCleanup(guild.id, channelId);
    }
  }

  public async setLock(
    channel: VoiceBasedChannel,
    record: VcRecord,
    locked: boolean,
  ): Promise<VcRecord> {
    const { everyone } = channel.guild.roles;
    await channel.permissionOverwrites.edit(everyone, {
      Connect: locked ? false : null,
    });
    if (locked) {
      for (const m of channel.members.values()) {
        await channel.permissionOverwrites
          .edit(m.id, { Connect: true })
          .catch(() => null);
      }
    }
    const next = { ...record, locked };
    await setVcRecord(channel.guild.id, channel.id, next);
    return next;
  }

  public async setHide(
    channel: VoiceBasedChannel,
    record: VcRecord,
    hidden: boolean,
  ): Promise<VcRecord> {
    const { everyone } = channel.guild.roles;
    await channel.permissionOverwrites.edit(everyone, {
      ViewChannel: hidden ? false : null,
    });
    if (hidden) {
      for (const m of channel.members.values()) {
        await channel.permissionOverwrites
          .edit(m.id, { ViewChannel: true })
          .catch(() => null);
      }
    }
    const next = { ...record, hidden };
    await setVcRecord(channel.guild.id, channel.id, next);
    return next;
  }

  public async setOwner(
    channel: VoiceBasedChannel,
    record: VcRecord,
    newOwnerId: string,
  ): Promise<VcRecord> {
    const oldOwner = channel.guild.members.cache.get(record.ownerId);
    if (oldOwner) {
      await channel.permissionOverwrites
        .edit(oldOwner.id, { ManageChannels: null })
        .catch(() => null);
    }
    await channel.permissionOverwrites
      .edit(newOwnerId, { ManageChannels: true })
      .catch(() => null);
    const next = { ...record, ownerId: newOwnerId };
    await setVcRecord(channel.guild.id, channel.id, next);
    return next;
  }

  public canManage(member: GuildMember, channel: VoiceBasedChannel): boolean {
    return channel
      .permissionsFor(member)
      .has(PermissionFlagsBits.ManageChannels);
  }

  public get moduleName() {
    return MODULE_NAME;
  }
}
