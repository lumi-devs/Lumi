import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle, type GuildMember } from "discord.js";
import { makeInfoCard } from "#utilities/cards.js";
import { isModuleEnabled } from "#utilities/listeners.js";
import { VerifyKeys, EMOJI_POOL, type SeqState } from "../keys.js";

const SEQ_LENGTH = 4;
const MAX_ATTEMPTS = 3;

function cryptoShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0]! % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildChallenge(): { sequence: number[]; buttons: number[] } {
  const indices = Array.from({ length: EMOJI_POOL.length }, (_, i) => i);
  const shuffledPool = cryptoShuffle(indices);
  const sequence = shuffledPool.slice(0, SEQ_LENGTH);
  const distractors = shuffledPool.slice(SEQ_LENGTH, SEQ_LENGTH * 2);
  const buttons = cryptoShuffle([...sequence, ...distractors]);
  return { sequence, buttons };
}

function buildRows(
  guildId: string,
  userId: string,
  buttons: number[],
  disabledCorrect: Set<number>,
): ActionRowBuilder<ButtonBuilder>[] {
  const half = Math.ceil(buttons.length / 2);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let r = 0; r < 2; r++) {
    const slice = buttons.slice(r * half, r * half + half);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      slice.map((idx) =>
        new ButtonBuilder()
          .setCustomId(`verify:seq:${guildId}:${userId}:${idx}`)
          .setLabel(EMOJI_POOL[idx]!)
          .setStyle(
            disabledCorrect.has(idx)
              ? ButtonStyle.Success
              : ButtonStyle.Secondary,
          )
          .setDisabled(disabledCorrect.has(idx)),
      ),
    );
    rows.push(row);
  }
  return rows;
}

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class VerifyMemberJoinListener extends Listener {
  public async run(member: GuildMember): Promise<void> {
    if (!(await isModuleEnabled(member.guild.id, "verify"))) return;

    const [pendingRoleId, timeoutMinutesRaw] = await Promise.all([
      this.container.db.config.getModuleConfig(
        member.guild.id,
        "verify",
        "pending_role_id",
      ),
      this.container.db.config.getModuleConfig(
        member.guild.id,
        "verify",
        "timeout_minutes",
      ),
    ]);
    const timeoutMinutes = (timeoutMinutesRaw as number | null) ?? 5;

    if (pendingRoleId && typeof pendingRoleId === "string") {
      await member.roles.add(pendingRoleId).catch(() => null);
    }

    const { sequence, buttons } = buildChallenge();
    const expiresAt = Date.now() + timeoutMinutes * 60 * 1000;

    const state: SeqState = {
      sequence,
      buttons,
      progress: 0,
      attempts: MAX_ATTEMPTS,
      expiresAt,
    };
    // Pipeline state-set + pending-zadd — one round-trip per join.
    await this.container.redis
      .multi()
      .set(
        VerifyKeys.seqState(member.guild.id, member.id),
        JSON.stringify(state),
        "EXAT",
        Math.floor(expiresAt / 1000),
      )
      .zadd(VerifyKeys.pendingSet(member.guild.id), expiresAt, member.id)
      .exec();

    const seqDisplay = sequence.map((i) => EMOJI_POOL[i]).join("  ");
    const rows = buildRows(member.guild.id, member.id, buttons, new Set());

    const card = makeInfoCard(
      `Welcome to ${member.guild.name}!`,
      `To gain access, click the emoji **in this exact order**:\n\n## ${seqDisplay}\n\n*Click them one at a time. You have **${MAX_ATTEMPTS} attempts** and **${timeoutMinutes} minute(s)**.*`,
      { actionRows: rows },
    );

    await member.send(card).catch(() => null);
  }
}
