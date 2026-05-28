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
import { logError } from "#utilities/errors.js";
import { scheduleTask } from "#lib/schedule-task.js";
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

      void vc.send(buildPanel(vc, record)).catch((err: unknown) => {
        logError("TempVC: panel send failed", err);
      });
    } finally {
      queue.shift();
      if (queue.remaining === 0) creationQueues.delete(generator.id);
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

  /** Job handler: delete the channel if it still exists and is empty. */
  public async runCleanup(data: {
    guildId: string;
    channelId: string;
  }): Promise<void> {
    const { guildId, channelId } = data;
    const record = await getVcRecord(guildId, channelId);
    if (!record) return;

    const channel = this.container.client.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      await removeVcRecord(guildId, channelId);
      return;
    }
    if (channel.members.size > 0) return;

    const deleted = await channel
      .delete("Empty temp VC cleanup")
      .then(() => true)
      .catch(() => false);
    if (deleted) await removeVcRecord(guildId, channelId);
  }

  /** Removes orphaned records and schedules cleanup for empty channels. */
  public async reconcileGuild(guild: Guild): Promise<void> {
    const records = await listVcRecords(guild.id);
    for (const [channelId] of records) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel || !channel.isVoiceBased()) {
        await removeVcRecord(guild.id, channelId);
        continue;
      }
      if (channel.members.size === 0) {
        await this.scheduleCleanup(guild.id, channelId);
      }
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
