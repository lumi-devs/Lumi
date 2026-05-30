import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ApplicationIntegrationType,
  GuildMember,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import {
  makeInfoCard,
  makeSuccessCard,
  makeErrorCard,
} from "#utilities/cards.js";
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

@ApplyOptions<Command.Options>({
  name: "verifytest",
  description: "Trigger a test CAPTCHA challenge in your DMs.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "verify",
})
export default class VerifyTestCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = interaction.member as GuildMember;
    const success = await this.#execute(member);

    if (success) {
      return interaction.editReply(
        makeSuccessCard(
          "CAPTCHA Sent",
          "Check your DMs to complete the test verification challenge!",
        ),
      );
    }
    return interaction.editReply(
      makeErrorCard(
        "Failed",
        "I could not send you a DM. Please open your DMs and try again!",
      ),
    );
  }

  public override async messageRun(message: Message) {
    const { member } = message;
    if (!member) return;

    const success = await this.#execute(member);

    if (success) {
      return message.reply(
        makeSuccessCard(
          "CAPTCHA Sent",
          "Check your DMs to complete the test verification challenge!",
        ),
      );
    }
    return message.reply(
      makeErrorCard(
        "Failed",
        "I could not send you a DM. Please open your DMs and try again!",
      ),
    );
  }

  async #execute(member: GuildMember): Promise<boolean> {
    const timeoutMinutesRaw = await this.container.db.config.getModuleConfig(
      member.guild.id,
      "verify",
      "timeout_minutes",
    );
    const timeoutMinutes = (timeoutMinutesRaw as number | null) ?? 5;

    const { sequence, buttons } = buildChallenge();
    const expiresAt = Date.now() + timeoutMinutes * 60 * 1000;

    const state: SeqState = {
      sequence,
      buttons,
      progress: 0,
      attempts: MAX_ATTEMPTS,
      expiresAt,
    };

    await this.container.redis.set(
      VerifyKeys.seqState(member.guild.id, member.id),
      JSON.stringify(state),
      "EXAT",
      Math.floor(expiresAt / 1000),
    );
    await this.container.redis.zadd(
      VerifyKeys.pendingSet(member.guild.id),
      expiresAt,
      member.id,
    );

    const seqDisplay = sequence.map((i) => EMOJI_POOL[i]).join("  ");
    const rows = buildRows(member.guild.id, member.id, buttons, new Set());

    const card = makeInfoCard(
      `Welcome to ${member.guild.name}!`,
      `To gain access, click the emoji **in this exact order**:\n\n## ${seqDisplay}\n\n*Click them one at a time. You have **${MAX_ATTEMPTS} attempts** and **${timeoutMinutes} minute(s)**.*`,
      { actionRows: rows },
    );

    try {
      await member.send(card);
      return true;
    } catch {
      return false;
    }
  }
}
