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
      const rawName = template.includes("{}")
        ? template.replace("{}", String(number))
        : `${template} ${number}`;
      // Discord caps channel names at 100 chars. Slice on code-point boundaries
      // (spread iterates code points, not UTF-16 units) so a multi-byte emoji at
      // the boundary can't be cut into a lone surrogate — which Discord's API
      // rejects as an invalid-form-body validation error.
      const name = [...rawName].slice(0, 100).join("");

      const vc = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: generator.parentId ?? undefined,
        userLimit: config.limit > 0 ? config.limit : undefined,
        reason: `Temp VC created by ${member.user.tag}`,
      });

      // If the member left voice before we could move them, setChannel rejects.
      // Don't leave an orphaned channel + control panel for the empty-VC reaper
      // to mop up later — tear it down now and bail.
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

      // Group managed VCs by the generator they spawned from, ordered by that
      // generator's channel position (admin-controlled), then by spawn number
      // within each group. Replaces the old hardcoded Duo/Trio/Squad name-regex:
      // grouping keys off the record's generatorId (structured data we already
      // store) instead of guessing a "type" from the channel name.
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

  public setLock(
    channel: VoiceBasedChannel,
    record: VcRecord,
    locked: boolean,
  ): Promise<VcRecord> {
    return this.#setRestriction(channel, record, "Connect", locked, { locked });
  }

  public setHide(
    channel: VoiceBasedChannel,
    record: VcRecord,
    hidden: boolean,
  ): Promise<VcRecord> {
    return this.#setRestriction(channel, record, "ViewChannel", hidden, {
      hidden,
    });
  }

  /**
   * Toggle a per-channel restriction: deny `permission` for @everyone (or clear
   * the override when inactive) and, while active, explicitly grant it to the
   * current members so they keep access. Persists `patch` onto the record.
   */
  async #setRestriction(
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
    const next = { ...record, ...patch };
    await setVcRecord(channel.guild.id, channel.id, next);
    return next;
  }

  public async setOwner(
    channel: VoiceBasedChannel,
    record: VcRecord,
    newOwnerId: string,
  ): Promise<VcRecord> {
    // The previous owner's id is already on the record — no member lookup
    // needed (and `permissionOverwrites.edit` takes a raw id). Gate on the
    // channel's own overwrite cache (channel-local, always populated) rather
    // than the member cache: that also clears the overwrite in the cold-cache
    // case where the old member wasn't resolvable and it would otherwise leak.
    if (channel.permissionOverwrites.cache.has(record.ownerId)) {
      await channel.permissionOverwrites
        .edit(record.ownerId, { ManageChannels: null })
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
